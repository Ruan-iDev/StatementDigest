"""Capitec Business PDF statement parser.

LOCKED edition-1 accurate (2026-07-31) — do not taint for Nedbank/other banks.
See docs/PARSER_STABILITY.md · Capitec Business edition-1 contract.

ISOLATION: Capitec Business only. Do not import Discovery/FNB/Nedbank parsers or
share regexes with those modules. Personal Capitec layouts may differ — do not
widen rules without a separate personal fixture.

Business layout (table):
  Post Date | Trans. Date | Description | Reference | Fees | Amount | Balance

Policy (Business, user-confirmed — match the statement, do NOT add Fee+Amount):
  - amount = Amount column only (never Fee + Amount)
  - fee_amount = Fees column when present (UI: Bank Fee under amount)
  - principal_amount = Amount column when a fee is present
  - Fee-only rows (Monthly Service Fee: Fees set, Amount blank):
      amount = 0.00, fee_amount = fee — always captured, never skipped
  - Cash fee is booked via Bank Charges & Fees sibling on import
  - Skip footer rows: Fee Total, VAT Total (not separate line items).
  - Skip Balance brought forward / Interest Rate noise.
"""

from __future__ import annotations

import io
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from app.services.money import to_decimal
from app.services.parsers.base import ParsedTransaction

# ── Detection ─────────────────────────────────────────────────────────────


def looks_like_capitec_text(text: str) -> bool:
    t = (text or "").lower()
    if not t.strip():
        return False
    # Keep out of Discovery/FNB islands
    if "discovery gold" in t or "discovery bank" in t:
        return False
    if "first national bank" in t or "gold business account" in t and "capitec" not in t:
        return False
    if "capitec" in t:
        return True
    if "capitecbank.co.za" in t.replace(" ", ""):
        return True
    # Business statement shape without brand OCR failure
    if "business account statement" in t and "post" in t and "fee" in t and "trans" in t:
        return True
    return False


def looks_like_capitec_business(text: str) -> bool:
    """Stricter: Business account product (not personal — until we have a personal sample)."""
    if not looks_like_capitec_text(text):
        return False
    t = (text or "").lower()
    return (
        "capitec business" in t
        or "business account statement" in t
        or "business account" in t
        or "business reg" in t
    )


# ── Amount helpers ────────────────────────────────────────────────────────


def _capitec_money(raw: object) -> Decimal:
    """Parse +38 249.85 / -1 396.00 / empty → Decimal."""
    if raw is None:
        return Decimal("0")
    s = str(raw).strip()
    if not s or s in {"—", "-", "–"}:
        return Decimal("0")
    # Normalise thin spaces / multi-line
    s = re.sub(r"\s+", " ", s.replace("\n", " ")).strip()
    return to_decimal(s)


def _cell(row: list, idx: int) -> str:
    if idx < 0 or idx >= len(row):
        return ""
    v = row[idx]
    if v is None:
        return ""
    return str(v).strip()


def _norm_header(h: str) -> str:
    return re.sub(r"\s+", " ", (h or "").replace("\n", " ")).strip().lower()


def _find_tx_table(tables: list[list[list]]) -> Optional[list[list]]:
    """Pick the transaction table by header keywords."""
    best = None
    best_score = 0
    for table in tables:
        if not table or len(table) < 2:
            continue
        hdr = " ".join(_norm_header(str(c or "")) for c in table[0])
        score = 0
        for token in ("post", "date", "description", "amount", "balance", "fees", "trans"):
            if token in hdr:
                score += 1
        if "description" in hdr and "amount" in hdr and score > best_score:
            best_score = score
            best = table
    return best


def _map_columns(header: list) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for i, h in enumerate(header):
        n = _norm_header(str(h or ""))
        if not n:
            continue
        if "post" in n and "date" in n:
            mapping.setdefault("post_date", i)
        elif n == "date" or (n.endswith("date") and "trans" not in n and "post" not in n):
            mapping.setdefault("post_date", i)
        if "trans" in n and "date" in n:
            mapping.setdefault("trans_date", i)
        if "description" in n or n == "details":
            mapping.setdefault("description", i)
        if "reference" in n or n == "ref":
            mapping.setdefault("reference", i)
        if n == "fees" or n.startswith("fee"):
            mapping.setdefault("fees", i)
        if n == "amount" or "amount" in n:
            mapping.setdefault("amount", i)
        if "balance" in n:
            mapping.setdefault("balance", i)
    return mapping


def _parse_capitec_date(raw: str) -> Optional[date]:
    s = re.sub(r"\s+", " ", (raw or "").replace("\n", " ")).strip()
    if not s:
        return None
    # 17/04/26 or 17/04/2026
    for fmt in ("%d/%m/%y", "%d/%m/%Y", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # Fallback dayfirst
    try:
        from dateutil import parser as date_parser

        return date_parser.parse(s, dayfirst=True).date()
    except (ValueError, TypeError, OverflowError):
        return None


def _is_skip_row(description: str, reference: str) -> bool:
    blob = f"{description} {reference}".strip().lower()
    if not blob:
        return True
    skip_exact = (
        "balance brought forward",
        "balance carried forward",
        "opening balance",
        "closing balance",
    )
    if any(s in blob for s in skip_exact):
        return True
    if blob.startswith("interest rate"):
        return True
    if "fee total" in blob:
        return True
    if "vat total" in blob or blob.startswith("vat @"):
        return True
    if "all fees charged are inclusive" in blob:
        return True
    return False


def _build_description(desc: str, reference: str) -> str:
    d = re.sub(r"\s+", " ", (desc or "").replace("\n", " ")).strip()
    r = re.sub(r"\s+", " ", (reference or "").replace("\n", " ")).strip()
    # Trim noisy auth tails a bit but keep useful merchant context
    if r and r.lower() not in d.lower():
        # Prefer first line-ish of reference for readability
        r_short = r[:120]
        return f"{d} · {r_short}".strip(" ·") if d else r_short
    return d or "(no description)"


def parse_capitec_business_table(
    table: list[list],
    calibration: Optional[dict[str, Any]] = None,
) -> list[ParsedTransaction]:
    """Parse one Capitec Business table: amount = Amount column only (not + Fees)."""
    if not table or len(table) < 2:
        return []
    cols = _map_columns(table[0])
    if "description" not in cols and "amount" not in cols:
        return []

    i_post = cols.get("post_date", cols.get("trans_date", 0))
    i_trans = cols.get("trans_date", i_post)
    i_desc = cols.get("description", 2)
    i_ref = cols.get("reference", 3)
    i_fees = cols.get("fees", 4)
    i_amt = cols.get("amount", 5)
    i_bal = cols.get("balance", 6)

    txs: list[ParsedTransaction] = []
    for row in table[1:]:
        if not row or not any(str(c or "").strip() for c in row):
            continue
        desc = _cell(row, i_desc)
        ref = _cell(row, i_ref)
        if _is_skip_row(desc, ref):
            continue

        date_raw = _cell(row, i_post) or _cell(row, i_trans)
        # Footer rows often have date empty and Fee Total in reference
        joined = " ".join(_cell(row, i) for i in range(len(row))).lower()
        if "fee total" in joined or "vat total" in joined or "vat @" in joined:
            continue

        tx_date = _parse_capitec_date(date_raw)
        if not tx_date:
            # Monthly fee / rows should still have dates; skip undated noise
            continue

        principal = _capitec_money(_cell(row, i_amt))
        fees = _capitec_money(_cell(row, i_fees))
        # Statement Amount only — blank Amount (fee-only e.g. Monthly Service Fee) → R0.00
        # Never skip fee-only rows: fee is shown as Bank Fee and booked to Bank Charges.
        if principal == 0 and fees == 0 and not desc:
            continue
        amount = principal  # 0.00 when Amount blank on statement

        bal_raw = _cell(row, i_bal)
        balance = _capitec_money(bal_raw) if bal_raw else None

        description = _build_description(desc, ref)

        txs.append(
            ParsedTransaction(
                date=tx_date,
                description=description,
                amount=amount,
                balance=balance,
                reference=ref or None,
                fee_amount=fees if fees != 0 else None,
                # principal mirrors Amount column when a fee is present (0 for fee-only)
                principal_amount=principal if fees != 0 else None,
            )
        )
    return txs


def _extract_all_tables(content: bytes) -> list[list[list]]:
    import pdfplumber

    tables: list[list[list]] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                if table:
                    tables.append(table)
    return tables


def _extract_text(content: bytes) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def parse_capitec_pdf_text(
    content: bytes,
    calibration: Optional[dict[str, Any]] = None,
) -> list[ParsedTransaction]:
    """Parse Capitec Business PDF: prefer tables; amount = Amount column only."""
    cal = dict(calibration or {})
    # Only Business path for now
    text = _extract_text(content)
    if cal.get("capitec_personal"):
        # Reserved for future personal layout
        return []
    if not looks_like_capitec_text(text) and not cal.get("capitec_preset") and not cal.get(
        "parser"
    ) == "capitec_business":
        # Still try tables if forced by calibration
        if not (
            cal.get("capitec_preset")
            or cal.get("bank_family") == "Capitec"
            or (cal.get("parser") or "").lower().startswith("capitec")
        ):
            return []

    tables = _extract_all_tables(content)
    txs: list[ParsedTransaction] = []
    # Prefer the main tx table; also merge multi-page tx tables
    for table in tables:
        hdr = " ".join(_norm_header(str(c or "")) for c in (table[0] if table else []))
        if "description" not in hdr or ("amount" not in hdr and "fees" not in hdr):
            continue
        if "post" not in hdr and "date" not in hdr:
            continue
        part = parse_capitec_business_table(table, cal)
        txs.extend(part)

    if not txs:
        # Fallback: single best table
        best = _find_tx_table(tables)
        if best:
            txs = parse_capitec_business_table(best, cal)

    return txs


# Preset for wizard / bank profile
CAPITEC_BUSINESS_PRESET: dict[str, Any] = {
    "file_type": "pdf",
    "parser": "capitec_business",
    "bank_family": "Capitec",
    "capitec_preset": True,
    "capitec_business": True,
    # Never add Fees into Amount — UI shows Fee left of statement Amount
    "combine_fees_into_amount": False,
    "has_header": True,
    "date_format": "auto",
    "date_column": "Post Date",
    "description_column": "Description",
    "reference_column": "Reference",
    "amount_column": "Amount",
    "fees_column": "Fees",
    "balance_column": "Balance",
    "amount_style": "signed_rand",
    "exclude_balance_rows": True,
    "skip_header_regions": True,
    "skip_footer": True,
    "include_personal_details": False,
    "include_account_number": False,
    "include_card_number": False,
    "fnb_preset": False,
    "discovery_preset": False,
}
