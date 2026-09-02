"""Bank Zero Mutual Bank PDF statement parser.

Edition-1 from samples A (June 2026) and B (July 2026).
ISOLATION: Bank Zero only. Do not import Discovery/FNB/Capitec/Nedbank parsers.

Layout:
  Page 1 — narrative summary (Opening Balance, Money In, Fees, Closing Balance). Not txs.
  Page 2+ — "Transaction History" with Amount + Balance columns.

Each posting is a date row plus a weekday/time detail row:

  03 Jun-26 Nedbank 3 196.50 14 461.39
  Wed 17h38 Quintin Bayards

Optional admin-fee amount sits on the detail row (Capitec-style sibling fee):

  19 Jun-26 EC Krugel -200.00 14 254.89
  Fri 08h33 Adm. Fees, 'Pay Immediately' B... -6.50

Policy:
  - amount = signed Amount column (positive = money in, negative = spend)
  - fee_amount = extra money on the detail row when present (not added into amount)
  - Skip summary, "Transaction History", "Amount/Balance" headers, page footers
"""

from __future__ import annotations

import io
import re
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from app.services.money import to_decimal
from app.services.parsers.base import ParsedTransaction

_MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# 3 196.50 | -16 000.00 | -6.50 | 14 461.39
_MONEY_RE = re.compile(r"(?<![\w.])([+-]?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)\.\d{2})(?![\w.])")
_DATE_RE = re.compile(r"^(\d{1,2})\s+([A-Za-z]{3})-(\d{2})\s+(.+)$")
_WEEKDAY_RE = re.compile(
    r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}h\d{2})\s*(.*)$",
    re.IGNORECASE,
)

BANK_ZERO_PRESET: dict[str, Any] = {
    "file_type": "pdf",
    "parser": "bank_zero_text",
    "bank_family": "Bank Zero",
    "bank_zero_preset": True,
    "date_format": "auto",
    "amount_style": "signed_rand",
    "exclude_balance_rows": True,
}


def looks_like_bank_zero_text(text: str) -> bool:
    t = (text or "").lower()
    if not t.strip():
        return False
    compact = t.replace(" ", "")
    if "bankzero.co.za" in compact or "bankzero" in compact:
        return True
    if "bank zero mutual bank" in t or "bank zero believes" in t:
        return True
    if "statement for" in t and "check account" in t and "transaction history" in t:
        # Unique combo vs other SA banks we already island
        if "discovery" in t or "capitec" in t or "first national bank" in t:
            return False
        return True
    return False


def _extract_text(content: bytes) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _money(raw: str) -> Decimal:
    return to_decimal(raw.replace("\u00a0", " "))


def _moneys(line: str) -> list[Decimal]:
    return [_money(m) for m in _MONEY_RE.findall(line or "")]


def _parse_date(day: str, mon: str, yy: str) -> date:
    month = _MONTHS.get(mon.strip().lower()[:3])
    if not month:
        raise ValueError(f"Unknown month {mon}")
    year = int(yy)
    if year < 100:
        year += 2000
    return date(year, month, int(day))


def _is_noise(line: str) -> bool:
    n = re.sub(r"\s+", " ", (line or "").strip().lower())
    if not n:
        return True
    if n in {"transaction history", "amount", "balance", "amount balance"}:
        return True
    if n.startswith("page ") and " of " in n:
        return True
    if n.startswith("opening balance") or n.startswith("closing balance"):
        return True
    return False


def parse_bank_zero_pdf_text(content: bytes, calibration: Optional[dict[str, Any]] = None) -> list[ParsedTransaction]:
    _ = calibration
    text = _extract_text(content)
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]

    # Prefer the history section; page-1 summary numbers are not postings.
    start = 0
    for i, ln in enumerate(lines):
        if ln.lower() == "transaction history":
            start = i + 1
            break
    body = [ln for ln in lines[start:] if not _is_noise(ln)]

    txs: list[ParsedTransaction] = []
    i = 0
    while i < len(body):
        line = body[i]
        m = _DATE_RE.match(line)
        if not m:
            i += 1
            continue
        day, mon, yy, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        amounts = _moneys(rest)
        if len(amounts) < 2:
            i += 1
            continue
        amount, balance = amounts[-2], amounts[-1]
        desc_head = _MONEY_RE.sub("", rest).strip(" -")
        desc_head = re.sub(r"\s+", " ", desc_head).strip()

        detail = ""
        fee: Optional[Decimal] = None
        if i + 1 < len(body) and not _DATE_RE.match(body[i + 1]):
            nxt = body[i + 1]
            wd = _WEEKDAY_RE.match(nxt)
            if wd:
                extra = (wd.group(3) or "").strip()
                fee_vals = _moneys(extra) or _moneys(nxt)
                if fee_vals:
                    fee = fee_vals[-1]
                    extra = _MONEY_RE.sub("", extra).strip(" -")
                if extra:
                    detail = extra
                i += 1
            elif _moneys(nxt) and not _DATE_RE.match(nxt):
                fee = _moneys(nxt)[-1]
                i += 1

        bits = [desc_head]
        if detail and detail.lower() not in desc_head.lower():
            bits.append(detail)
        description = " · ".join(b for b in bits if b) or "Bank Zero"

        txs.append(
            ParsedTransaction(
                date=_parse_date(day, mon, yy),
                description=description,
                amount=amount,
                balance=balance,
                fee_amount=abs(fee) if fee is not None and fee != 0 else None,
            )
        )
        i += 1

    return txs
