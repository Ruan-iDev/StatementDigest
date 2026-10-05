"""Statement reconciliation harness for the private bot corpus.

For every PDF under ``samples/bot-corpus/<bank>/`` this:

  1. Parses with the bank's **own island module only** (``discovery_pdf`` for
     ``discovery/``, ``fnb_pdf`` for ``fnb/``) — no auto-detect, no cross-bank
     fallbacks, so one bank's parser can never mask another's bug.
  2. Reads the statement's printed opening / closing balance and period
     (harness-side regexes — parsers are not asked for these).
  3. Checks ``opening + sum(amounts) == closing`` (within R0.01).
  4. Where the parser returns running balances, checks the balance chain
     row by row and reports the first break.
  5. Checks every transaction date falls inside the statement period
     (with a small grace window for bank carry-overs) — catches year bugs.

Usage (from ``backend/``)::

    LEDGERFLOW_DATA=/workspace/ledgerflow-bot-data python reconcile_corpus.py
    python reconcile_corpus.py --bank fnb -v
    python reconcile_corpus.py --corpus /path/to/bot-corpus --json out.json

The corpus is personal data and gitignored — never commit it.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable, Optional

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_CORPUS = PROJECT_ROOT / "samples" / "bot-corpus"

# Never let a harness run point at the user's real Documents/LedgerFlow DB.
os.environ.setdefault("LEDGERFLOW_DATA", "/workspace/ledgerflow-bot-data")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

TOLERANCE = Decimal("0.01")
# Discovery prints bank-side carry-overs dated a few days before the period.
DATE_GRACE_BEFORE = timedelta(days=10)
DATE_GRACE_AFTER = timedelta(days=3)

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "mei": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "okt": 10, "nov": 11, "dec": 12, "des": 12,
}
_MON = r"(Jan|Feb|Mar|Apr|May|Mei|Jun|Jul|Aug|Sep|Oct|Okt|Nov|Dec|Des)[a-z]*"


def _mk_date(d: str, m: str, y: str) -> date:
    return date(int(y), _MONTHS[m[:3].lower()], int(d))


def _money(raw: str) -> Decimal:
    """Parse '1,575.00Cr' / '93 063.29Dr' / '- R1 804.49' / 'R52.02Cr' to signed Decimal."""
    s = raw.strip()
    neg = False
    if re.search(r"(?i)(dr|dt)\.?$", s):
        neg = True
    s = re.sub(r"(?i)(cr|dr|kt|dt)\.?$", "", s)
    if s.lstrip().startswith("-"):
        neg = True
    s = re.sub(r"[^\d.]", "", s)
    try:
        v = Decimal(s)
    except InvalidOperation as e:
        raise ValueError(raw) from e
    return -v if neg else v


@dataclass
class StatementMeta:
    opening: Optional[Decimal] = None
    closing: Optional[Decimal] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None


@dataclass
class Result:
    path: str
    bank: str
    product: str
    tx_count: int = 0
    opening: Optional[str] = None
    closing: Optional[str] = None
    total: Optional[str] = None
    diff: Optional[str] = None
    status: str = "ok"  # ok | mismatch | no_balances | error
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status == "ok"


# ── Statement metadata (harness side, per bank) ─────────────────────────────

_DISC_OPEN = re.compile(r"Opening balance on\s+\d{1,2}\s+\w+\s+\d{4}\s+(-?\s*R\s*[\d\s,]+\.\d{2})", re.I)
_DISC_CLOSE = re.compile(r"Closing balance on\s+\d{1,2}\s+\w+\s+\d{4}\s+(-?\s*R\s*[\d\s,]+\.\d{2})", re.I)
_DISC_PERIOD = re.compile(
    r"Statement period\s+(\d{1,2})\s+" + _MON + r"\s+(\d{4})\s*-\s*(\d{1,2})\s+" + _MON + r"\s+(\d{4})",
    re.I,
)


def discovery_meta(text: str) -> StatementMeta:
    meta = StatementMeta()
    if m := _DISC_OPEN.search(text):
        meta.opening = _money(m.group(1).replace("\n", " "))
    if m := _DISC_CLOSE.search(text):
        meta.closing = _money(m.group(1).replace("\n", " "))
    if m := _DISC_PERIOD.search(text):
        meta.period_start = _mk_date(m.group(1), m.group(2), m.group(3))
        meta.period_end = _mk_date(m.group(4), m.group(5), m.group(6))
    return meta


_FNB_AMT = r"(R?\s?\d{1,3}(?:[, ]\d{3})*\.\d{2}(?:Cr|Dr|Kt|Dt)?)"
_FNB_OPEN = re.compile(r"(?:Opening\s*Balance|Openingsaldo)\s*:?\s*" + _FNB_AMT, re.I)
_FNB_CLOSE = re.compile(r"(?:Closing\s*Balance|Afsluitingsaldo)\s*:?\s*" + _FNB_AMT, re.I)
_FNB_PERIOD = re.compile(
    r"(?:Statement\s*Period\s*:?|Staat\s*Periode\s*:?|Transaction\s+History\s+from)\s*"
    r"(\d{1,2})\s*" + _MON + r"\s*(\d{4})\s*(?:to|tot)\s*(\d{1,2})\s*" + _MON + r"\s*(\d{4})",
    re.I,
)


def fnb_meta(text: str) -> StatementMeta:
    meta = StatementMeta()
    if m := _FNB_OPEN.search(text):
        meta.opening = _money(m.group(1))
    # Last "Closing Balance" line is the transaction-table footer; first is summary.
    closes = _FNB_CLOSE.findall(text)
    if closes:
        meta.closing = _money(closes[0])
    if m := _FNB_PERIOD.search(text):
        meta.period_start = _mk_date(m.group(1), m.group(2), m.group(3))
        meta.period_end = _mk_date(m.group(4), m.group(5), m.group(6))
    return meta


# ── Island registry: bank folder → (parser, meta) — never cross banks ───────


def _discovery_parse(content: bytes):
    from app.services.parsers.discovery_pdf import parse_discovery_pdf_text

    return parse_discovery_pdf_text(content, {})


def _fnb_parse(content: bytes):
    from app.services.parsers.fnb_pdf import parse_fnb_pdf_text

    return parse_fnb_pdf_text(content, {"amount_style": "credit_suffix_cr"})


ISLANDS: dict[str, tuple[Callable, Callable[[str], StatementMeta]]] = {
    "discovery": (_discovery_parse, discovery_meta),
    "fnb": (_fnb_parse, fnb_meta),
}


def _pdf_text(content: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


def product_of(path: Path, corpus: Path) -> str:
    rel = path.relative_to(corpus).parts
    bank = rel[0]
    if bank == "fnb" and len(rel) >= 4:
        return f"{rel[1]}/{rel[2]}"  # e.g. personal/Easy Account
    return bank


def reconcile_pdf(path: Path, corpus: Path = DEFAULT_CORPUS) -> Result:
    bank = path.relative_to(corpus).parts[0].lower()
    res = Result(path=str(path), bank=bank, product=product_of(path, corpus))
    if bank not in ISLANDS:
        res.status = "error"
        res.problems.append(f"no island registered for bank folder {bank!r}")
        return res
    parse, meta_fn = ISLANDS[bank]
    content = path.read_bytes()
    try:
        txs = parse(content)
        meta = meta_fn(_pdf_text(content))
    except Exception as e:  # noqa: BLE001 - report, don't crash the sweep
        res.status = "error"
        res.problems.append(f"{type(e).__name__}: {e}")
        return res

    res.tx_count = len(txs)
    total = sum((t.amount for t in txs), Decimal("0"))
    res.total = str(total)

    # Date sanity — catches wrong-year / wrong-month assignment.
    if meta.period_start and meta.period_end:
        lo = meta.period_start - DATE_GRACE_BEFORE
        hi = meta.period_end + DATE_GRACE_AFTER
        bad = [t for t in txs if not (lo <= t.date <= hi)]
        if bad:
            res.problems.append(
                f"{len(bad)} tx date(s) outside period {meta.period_start}..{meta.period_end}, "
                f"e.g. {bad[0].date} {bad[0].description[:40]!r}"
            )

    if meta.opening is None or meta.closing is None:
        res.status = "no_balances"
        res.problems.append("opening/closing balance not found in statement text")
        return res

    res.opening, res.closing = str(meta.opening), str(meta.closing)
    diff = meta.opening + total - meta.closing
    res.diff = str(diff)
    if abs(diff) > TOLERANCE:
        res.status = "mismatch"
        res.problems.append(
            f"opening {meta.opening} + sum {total} = {meta.opening + total} != closing {meta.closing} "
            f"(diff {diff})"
        )

    # Running balance chain (FNB returns balances; Discovery does not).
    prev = meta.opening
    for i, t in enumerate(txs):
        if t.balance is None:
            prev = None
            continue
        if prev is not None and abs(prev + t.amount - t.balance) > TOLERANCE:
            res.problems.append(
                f"balance chain break at row {i + 1} ({t.date} {t.description[:40]!r} "
                f"amt {t.amount}): expected {prev + t.amount}, statement {t.balance}"
            )
            if res.status == "ok":
                res.status = "mismatch"
            break
        prev = t.balance

    if res.problems and res.status == "ok":
        res.status = "mismatch"
    return res


def iter_pdfs(corpus: Path, bank: Optional[str] = None):
    for p in sorted(corpus.rglob("*.pdf")):
        if bank and p.relative_to(corpus).parts[0].lower() != bank:
            continue
        yield p


def summarize(results: list[Result]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for r in results:
        s = out.setdefault(r.product, {"ok": 0, "total": 0, "txs": 0})
        s["total"] += 1
        s["txs"] += r.tx_count
        s["ok"] += int(r.ok)
    return out


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    ap.add_argument("--bank", choices=sorted(ISLANDS))
    ap.add_argument("--json", type=Path, help="write full results as JSON")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count() or 1, help="parallel workers")
    ap.add_argument("-v", "--verbose", action="store_true", help="print every file")
    args = ap.parse_args(argv)

    if not args.corpus.is_dir():
        print(f"corpus not found: {args.corpus}", file=sys.stderr)
        return 2

    pdfs = list(iter_pdfs(args.corpus, args.bank))
    if args.jobs > 1:
        from concurrent.futures import ProcessPoolExecutor

        with ProcessPoolExecutor(max_workers=args.jobs) as ex:
            results = list(ex.map(reconcile_pdf, pdfs, [args.corpus] * len(pdfs)))
    else:
        results = [reconcile_pdf(p, args.corpus) for p in pdfs]
    for r in results:
        if args.verbose or not r.ok:
            flag = "OK  " if r.ok else r.status.upper()
            print(f"[{flag}] {r.path}  txs={r.tx_count} open={r.opening} close={r.closing} sum={r.total}")
            for p in r.problems:
                print(f"        - {p}")

    print("\nSummary (reconciled / statements · transactions):")
    for prod, s in sorted(summarize(results).items()):
        print(f"  {prod:<32} {s['ok']:>3}/{s['total']:<3} · {s['txs']} txs")
    ok = sum(r.ok for r in results)
    print(f"  {'ALL':<32} {ok:>3}/{len(results)}")

    if args.json:
        args.json.write_text(json.dumps([asdict(r) for r in results], indent=2))
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
