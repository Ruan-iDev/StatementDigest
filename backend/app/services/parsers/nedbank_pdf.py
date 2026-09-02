"""Nedbank personal current-account PDF statement parser.

LOCKED edition-1 accurate (2026-07-31) — do not taint for other banks.
See docs/PARSER_STABILITY.md · Nedbank Personal edition-1 contract.
Pending: bulk multi-statement import verification (same bar as Discovery/FNB).

ISOLATION: Nedbank only. Do not import Discovery / FNB / Capitec parsers or share
regexes with those modules. Business layouts may differ — widen only with fixtures.

Personal current account layout (text, page 2+):
  Tranlistno Date Description Fees(R) Debits(R) Credits(R) Balance(R)

Examples:
  000259 10/01/2026 THAI FARMERS … 85.50 2,921.58 -20,294.46
      ← Fees(R)=85.50 + Debits(R)=2,921.58 → amount=-2921.58, fee_amount=-85.50
  10/01/2026 DEBIT ATM CASH… 65.00* -20,359.46
      ← amount in Fees column with * = standalone debit line (NOT fee metadata)
  12/01/2026 authority Edge 2,000.00 -22,359.46          ← debit, blank Fees
  17/01/2026 I FARQUHAR 500.00 -40,197.46                ← credit
  Closingbalance -35,065.24                              ← skip

Policy (user-confirmed from sample lines 2–3):
  - amount = signed cash movement (debit negative, credit positive)
  - fee_amount ONLY when Fees(R) is filled AND there is a separate Debit/Credit
    on the same row (e.g. Thai Farmers 85.50 fee + 2,921.58 debit)
  - Lines with only a * amount (65.00*, Instant payment fee, ATM/SSD FEE, etc.)
    are normal debit transactions → amount = -value, fee_amount = None
  - Blank Fees column → fee_amount = None (UI hides Bank Fee; treat as R0)
  - R0.00 debit/credit lines with a real description (e.g. VAT note) are **kept**
    as amount = 0.00 so the user can still allocate — never skip real tran-list rows
  - Skip only Openingbalance / Closingbalance (not true postings)
"""

from __future__ import annotations

import io
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from app.services.money import to_decimal
from app.services.parsers.base import ParsedTransaction

# Money at end of line: optional minus, thousands commas, optional * fee marker
_MONEY_RE = re.compile(
    r"(?<![\w.])(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})(\*)?(?![\w.])"
)
_DATE_RE = re.compile(r"\b(\d{2}/\d{2}/\d{4})\b")
_LISTNO_RE = re.compile(r"^\s*(\d{5,8})\s+")


def looks_like_nedbank_text(text: str) -> bool:
    t = (text or "").lower()
    if not t.strip():
        return False
    # Keep out of other islands
    if "bank zero" in t or "bankzero" in t.replace(" ", ""):
        return False
    if "capitec" in t and "nedbank" not in t:
        return False
    if "discovery bank" in t or "discovery gold" in t:
        return False
    if "first national bank" in t or ("gold business account" in t and "nedbank" not in t):
        return False
    if "nedbank" in t or "nedbank.co.za" in t.replace(" ", ""):
        return True
    if "tranlistno" in t and "debits(r)" in t and "credits(r)" in t:
        return True
    if "see moneydifferently" in t.replace(" ", ""):
        return True
    return False


def _extract_text(content: bytes) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _parse_date(raw: str) -> Optional[date]:
    s = (raw or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _money_token(raw: str, starred: bool) -> tuple[Decimal, bool]:
    d = to_decimal(raw.replace(",", ""))
    return d, starred


def _is_skip_description(desc: str) -> bool:
    d = re.sub(r"\s+", "", (desc or "").lower())
    if not d:
        return True
    if "openingbalance" in d or d.startswith("opening"):
        return True
    if "closingbalance" in d or d.startswith("closing"):
        return True
    return False


def parse_nedbank_transaction_lines(text: str) -> list[ParsedTransaction]:
    """Parse Nedbank tran list from extracted PDF text."""
    lines = (text or "").splitlines()
    # Find start of transaction list
    start = -1
    for i, line in enumerate(lines):
        low = line.lower().replace(" ", "")
        if "tranlistno" in low and "debits" in low:
            start = i + 1
            break
        if "tranlistno" in low and "date" in low and "description" in low:
            start = i + 1
            break
    if start < 0:
        # Fallback: first line that looks like a dated tx
        for i, line in enumerate(lines):
            if _DATE_RE.search(line) and ("opening" in line.lower() or re.search(r"\d+\.\d{2}", line)):
                start = i
                break
    if start < 0:
        return []

    txs: list[ParsedTransaction] = []
    prev_balance: Optional[Decimal] = None

    for line in lines[start:]:
        raw = (line or "").strip()
        if not raw:
            continue
        low = raw.lower()
        if low.startswith("see money") or "ombudsman" in low or "page " in low:
            break
        if "nedbank ltd" in low or "we subscribe" in low:
            break

        # Closing balance alone
        if re.match(r"(?i)^closing\s*balance", raw.replace(" ", "")) or re.match(
            r"(?i)^closingbalance", raw.replace(" ", "")
        ):
            break

        date_m = _DATE_RE.search(raw)
        if not date_m:
            continue
        tx_date = _parse_date(date_m.group(1))
        if not tx_date:
            continue

        # Description = between date and first money token after date
        after_date = raw[date_m.end() :].strip()
        money_matches = list(_MONEY_RE.finditer(after_date))
        if not money_matches:
            continue

        desc_end = money_matches[0].start()
        description = re.sub(r"\s+", " ", after_date[:desc_end]).strip()
        if _is_skip_description(description or raw):
            # Capture opening balance for delta chain only
            bal_raw, _ = _money_token(money_matches[-1].group(1), bool(money_matches[-1].group(2)))
            prev_balance = bal_raw
            continue

        tokens: list[tuple[Decimal, bool]] = [
            _money_token(m.group(1), bool(m.group(2))) for m in money_matches
        ]
        balance = tokens[-1][0]
        mid = tokens[:-1]

        fee_amount: Optional[Decimal] = None
        cash = Decimal("0")

        starred = [(v, s) for v, s in mid if s]
        plain = [(v, s) for v, s in mid if not s]

        if starred and not plain:
            # e.g. DEBIT ATM CASH 65.00* — Fees column with * is a *standalone debit*
            # (not Bank Fee metadata). Book amount only; fee_amount stays None.
            fee_val = abs(starred[0][0])
            fee_amount = None
            if prev_balance is not None:
                delta = balance - prev_balance
                cash = delta if abs(abs(delta) - fee_val) < Decimal("0.02") else -fee_val
            else:
                cash = -fee_val
        elif plain and starred:
            # Rare: starred fee + plain amount — cash from plain; * is display fee only
            # if both present (prefer dual-column fee display only when plain fee + debit)
            fee_amount = -abs(starred[0][0])
            cash_abs = abs(plain[0][0])
            if prev_balance is not None:
                delta = balance - prev_balance
                cash = delta
            else:
                cash = -cash_abs
        elif len(plain) >= 2:
            # Fees(R) filled + Debits/Credits filled (no *), e.g. Thai Farmers:
            # 85.50 fee + 2,921.58 debit → Bank Fee display + amount = debit/credit
            fee_raw = abs(plain[0][0])
            cash_abs = abs(plain[1][0])
            fee_amount = -fee_raw if fee_raw != 0 else None
            if prev_balance is not None:
                delta = balance - prev_balance
                # Balance on sample moves by debit/credit only (fee is column display)
                if abs(abs(delta) - cash_abs) < Decimal("0.02"):
                    cash = -cash_abs if delta < 0 else cash_abs
                else:
                    cash = delta
            else:
                cash = -cash_abs
        elif len(plain) == 1:
            # Single amount: Debit or Credit; Fees column blank → no Bank Fee
            # Includes R0.00 postings (e.g. VAT note line) — still capture for allocation
            cash_abs = abs(plain[0][0])
            fee_amount = None
            if prev_balance is not None:
                delta = balance - prev_balance
                if abs(abs(delta) - cash_abs) < Decimal("0.02"):
                    cash = delta  # signed from balance (0 when both zero)
                elif cash_abs < Decimal("0.005") and abs(delta) < Decimal("0.005"):
                    cash = Decimal("0")  # explicit R0.00 line — keep it
                else:
                    cash = delta
            else:
                cash = Decimal("0") if cash_abs < Decimal("0.005") else -cash_abs
        else:
            # No mid amounts — still keep the row if description exists (amount R0)
            if not description:
                prev_balance = balance
                continue
            cash = Decimal("0")
            fee_amount = None

        # Never drop a dated tran-list row with a description (R0.00 still matters)
        if not description.strip():
            prev_balance = balance
            continue

        listno_m = _LISTNO_RE.match(raw)
        reference = listno_m.group(1) if listno_m else None

        txs.append(
            ParsedTransaction(
                date=tx_date,
                description=description or "(no description)",
                amount=cash,
                balance=balance,
                reference=reference,
                # Only dual-column Fees+Amount rows carry fee_amount for UI
                fee_amount=fee_amount if fee_amount not in (None, 0, Decimal("0")) else None,
                principal_amount=None,
            )
        )
        prev_balance = balance

    return txs


def parse_nedbank_pdf_text(
    content: bytes,
    calibration: Optional[dict[str, Any]] = None,
) -> list[ParsedTransaction]:
    cal = dict(calibration or {})
    text = _extract_text(content)
    if not looks_like_nedbank_text(text) and not cal.get("nedbank_preset"):
        if not (cal.get("parser") or "").lower().startswith("nedbank"):
            return []
    return parse_nedbank_transaction_lines(text)


NEDBANK_PERSONAL_PRESET: dict[str, Any] = {
    "file_type": "pdf",
    "parser": "nedbank_text",
    "bank_family": "Nedbank",
    "nedbank_preset": True,
    "has_header": True,
    "date_format": "auto",
    "amount_style": "signed_rand",
    "exclude_balance_rows": True,
    "skip_footer": True,
    "fnb_preset": False,
    "discovery_preset": False,
    "capitec_preset": False,
}
