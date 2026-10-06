"""Statement header metadata: account identity + printed balances + period.

Used by the double-entry layer (bank accounts as ledgers, opening balances,
bank reconciliation). This module never parses transaction rows — the bank
parser islands stay untouched — it only reads the statement *header/footer*:

* account number (e.g. ``62753959843`` / ``4-000-094-909-728`` / Discovery ``18882058643``)
* product label  (e.g. ``FNB Private Wealth Current Account``, ``Personal Loan``)
* printed opening / closing balance (signed: overdrawn / loan balances negative)
* statement period

The balance regexes mirror ``backend/reconcile_corpus.py`` (harness side) so
both agree on what "the printed balance" is.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, asdict
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "mei": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "okt": 10, "nov": 11, "dec": 12, "des": 12,
}
_MON = r"(Jan|Feb|Mar|Apr|May|Mei|Jun|Jul|Aug|Sep|Oct|Okt|Nov|Dec|Des)[a-z]*"


@dataclass
class StatementMeta:
    bank: Optional[str] = None  # FNB | Discovery | None
    account_number: Optional[str] = None
    product: Optional[str] = None
    opening: Optional[Decimal] = None
    closing: Optional[Decimal] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    is_loan: bool = False

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        for k in ("opening", "closing"):
            if d[k] is not None:
                d[k] = str(d[k])
        for k in ("period_start", "period_end"):
            if d[k] is not None:
                d[k] = d[k].isoformat()
        return d


def _mk_date(d: str, m: str, y: str) -> Optional[date]:
    try:
        return date(int(y), _MONTHS[m[:3].lower()], int(d))
    except (KeyError, ValueError):
        return None


def _money(raw: str) -> Optional[Decimal]:
    s = (raw or "").strip()
    neg = bool(re.search(r"(?i)(dr|dt)\.?$", s))
    s = re.sub(r"(?i)(cr|dr|kt|dt)\.?$", "", s)
    if s.lstrip().startswith("-"):
        neg = True
    s = re.sub(r"[^\d.]", "", s)
    if not s:
        return None
    try:
        v = Decimal(s)
    except InvalidOperation:
        return None
    return -v if neg else v


# ── Discovery ────────────────────────────────────────────────────────────────
_DISC_OPEN = re.compile(r"Opening balance on\s+\d{1,2}\s+\w+\s+\d{4}\s+(-?\s*R\s*[\d\s,]+\.\d{2})", re.I)
_DISC_CLOSE = re.compile(r"Closing balance on\s+\d{1,2}\s+\w+\s+\d{4}\s+(-?\s*R\s*[\d\s,]+\.\d{2})", re.I)
_DISC_PERIOD = re.compile(
    r"Statement period\s+(\d{1,2})\s+" + _MON + r"\s+(\d{4})\s*-\s*(\d{1,2})\s+" + _MON + r"\s+(\d{4})",
    re.I,
)
_DISC_ACC = re.compile(r"(Discovery\s+[A-Za-z ]*?Account)\s+(\d{8,14})\b")

# ── FNB ──────────────────────────────────────────────────────────────────────
_FNB_AMT = r"(R?\s?\d{1,3}(?:[, ]\d{3})*\.\d{2}(?:Cr|Dr|Kt|Dt)?)"
_FNB_OPEN = re.compile(r"(?:Opening\s*Balance|Openingsaldo)\s*:?\s*" + _FNB_AMT, re.I)
_FNB_CLOSE = re.compile(r"(?:Closing\s*Balance|Afsluitingsaldo)\s*:?\s*" + _FNB_AMT, re.I)
_FNB_PERIOD = re.compile(
    r"(?:Statement\s*Period\s*:?|Staat\s*Periode\s*:?|Transaction\s+History\s+from)\s*"
    r"(\d{1,2})\s*" + _MON + r"\s*(\d{4})\s*(?:to|tot)\s*(\d{1,2})\s*" + _MON + r"\s*(\d{4})",
    re.I,
)
# "FNB Private Wealth Current Account :62753959843" / "GoldBusinessAccount:63197269070"
# / "Money Maximiser :62895347237"
_FNB_PRODUCT_ACC = re.compile(r"Not\s*Provided\s*([A-Za-z][A-Za-z &\-]{2,60}?)\s*:\s*(\d{9,14})\b")
_FNB_XST = re.compile(r"\b(?:XSTZFN0|CSFZFN0|[A-Z]{4}FN\d):(\d{9,14})\b")
_FNB_ACCNO = re.compile(r"Account\s*Number\s*:?\s*([\d][\d\- ]{8,20}\d)", re.I)
_FNB_LOAN = re.compile(r"Personal\s*Loan\s*Statement", re.I)
_FNB_LOAN_AS_AT = re.compile(r"Statement\s*as\s*at\s*(\d{1,2})\s*" + _MON + r"\s*(\d{4})", re.I)


def looks_like_discovery(text: str) -> bool:
    return "discovery bank" in text.lower() or "discovery gold" in text.lower() or bool(_DISC_ACC.search(text))


def discovery_meta(text: str) -> StatementMeta:
    meta = StatementMeta(bank="Discovery")
    if m := _DISC_OPEN.search(text):
        meta.opening = _money(m.group(1).replace("\n", " "))
    if m := _DISC_CLOSE.search(text):
        meta.closing = _money(m.group(1).replace("\n", " "))
    if m := _DISC_PERIOD.search(text):
        meta.period_start = _mk_date(m.group(1), m.group(2), m.group(3))
        meta.period_end = _mk_date(m.group(4), m.group(5), m.group(6))
    if m := _DISC_ACC.search(text):
        meta.product = re.sub(r"\s+", " ", m.group(1)).strip()
        meta.account_number = m.group(2)
    return meta


def _humanise_product(raw: str) -> str:
    s = raw.strip()
    if " " not in s:  # squashed text: "GoldBusinessAccount"
        s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    return re.sub(r"\s+", " ", s).strip()


_VAT_NOISE = re.compile(r"^.*?(?:Not\s*Provided)\s*", re.I)


def _fnb_product_for(text: str, account_number: str) -> Optional[str]:
    """Product label printed next to the account number (not the XST routing line)."""
    for line in text.splitlines():
        if account_number not in line or re.search(r"[A-Z]{4}FN\d:", line):
            continue
        head = line.split(account_number, 1)[0]
        head = _VAT_NOISE.sub("", head).strip(" :")
        if re.search(r"[A-Za-z]{3}", head) and "registration" not in head.lower():
            return _humanise_product(head)
    return None


def fnb_meta(text: str) -> StatementMeta:
    meta = StatementMeta(bank="FNB")
    if m := _FNB_OPEN.search(text):
        meta.opening = _money(m.group(1))
    closes = _FNB_CLOSE.findall(text)
    if closes:
        meta.closing = _money(closes[0])
    if m := _FNB_PERIOD.search(text):
        meta.period_start = _mk_date(m.group(1), m.group(2), m.group(3))
        meta.period_end = _mk_date(m.group(4), m.group(5), m.group(6))
    if m := _FNB_XST.search(text):
        meta.account_number = m.group(1)
    if meta.account_number:
        meta.product = _fnb_product_for(text, meta.account_number)
    elif m := _FNB_PRODUCT_ACC.search(text):
        meta.account_number = m.group(2)
        meta.product = _humanise_product(m.group(1))
    if _FNB_LOAN.search(text):
        meta.is_loan = True
        meta.product = "Personal Loan"
        if m := _FNB_ACCNO.search(text):
            meta.account_number = re.sub(r"\D", "", m.group(1))
        elif m := _FNB_XST.search(text):
            meta.account_number = m.group(1)
        if not meta.period_end and (m := _FNB_LOAN_AS_AT.search(text)):
            meta.period_end = _mk_date(m.group(1), m.group(2), m.group(3))
    return meta


def meta_from_text(text: str, bank_hint: Optional[str] = None) -> StatementMeta:
    hint = (bank_hint or "").lower()
    if hint.startswith("discovery") or (not hint.startswith("fnb") and looks_like_discovery(text)):
        meta = discovery_meta(text)
        if meta.account_number or meta.opening is not None:
            return meta
    meta = fnb_meta(text)
    if meta.account_number or meta.opening is not None or hint.startswith("fnb"):
        return meta
    return StatementMeta()


def pdf_text(content: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


def meta_from_pdf_bytes(content: bytes, bank_hint: Optional[str] = None) -> StatementMeta:
    try:
        text = pdf_text(content)
    except Exception:  # noqa: BLE001 - corrupt / non-PDF → no metadata
        return StatementMeta()
    return meta_from_text(text, bank_hint)


def meta_from_path(path: Path, bank_hint: Optional[str] = None) -> StatementMeta:
    if path.suffix.lower() != ".pdf":
        return StatementMeta()
    return meta_from_pdf_bytes(path.read_bytes(), bank_hint)


_FILENAME_ACC = re.compile(r"^\s*(\d[\d\-]{7,18}\d)(?=[\s_\-.])")


def account_number_from_filename(filename: str) -> Optional[str]:
    """'62753959843 2022-03-16.pdf' → '62753959843'; '18882058643_Personal…' → '18882058643'."""
    m = _FILENAME_ACC.match(Path(filename or "").name)
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group(1))
    return digits if 8 <= len(digits) <= 16 else None
