"""Flexible statement parser driven by BankProfile calibration_data.

calibration_data schema (JSON):
{
  "file_type": "csv" | "pdf",
  "delimiter": ",",
  "encoding": "utf-8",
  "has_header": true,
  "skip_rows": 0,
  "skip_footer_rows": 0,
  "date_format": "%Y-%m-%d" | "%d/%m/%Y" | "auto",
  "date_column": "Date" | 0,
  "description_column": "Description",
  "amount_column": "Amount",
  "debit_column": null,
  "credit_column": null,
  "balance_column": "Balance",
  "reference_column": "Reference",
  "type_column": null,
  "card_column": null,
  "amount_sign": "normal" | "invert",
  "amount_style": "normal" | "signed_rand" | "credit_suffix_cr",
  "debit_is_negative": true,
  "exclude_balance_rows": true,
  "balance_row_markers": ["opening balance", "closing balance"],
  "include_card_number": false,
  "include_personal_details": false,
  "description_cleanup": [],
  "fnb_preset": false,
  "discovery_preset": false
}
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Optional

from dateutil import parser as date_parser

from app.services.money import apply_amount_style, to_decimal


@dataclass
class ParsedTransaction:
    date: date
    description: str
    amount: Decimal  # statement Amount (Capitec: never Fee+Amount combined)
    balance: Optional[Decimal] = None
    reference: Optional[str] = None
    # Capitec Business only: Fees column for same-line display left of amount
    fee_amount: Optional[Decimal] = None
    principal_amount: Optional[Decimal] = None  # statement Amount when fee present


# ── Presets for FNB / Discovery ────────────────────────────────────────────

DEFAULT_BALANCE_MARKERS = [
    "opening balance",
    "closing balance",
    "balance brought forward",
    "balance carried forward",
    "b/f",
    "c/f",
]

FNB_CSV_PRESET: dict[str, Any] = {
    "file_type": "csv",
    "delimiter": ",",
    "encoding": "utf-8",
    "has_header": True,
    "skip_rows": 0,
    "skip_footer_rows": 0,
    "date_format": "%Y/%m/%d",
    "date_column": "Date",
    "description_column": "Description",
    "amount_column": "Amount",
    "debit_column": None,
    "credit_column": None,
    "balance_column": "Balance",
    "reference_column": "Reference",
    "amount_sign": "normal",
    "amount_style": "normal",  # sample CSVs are signed; real FNB often uses credit_suffix_cr
    "debit_is_negative": True,
    "exclude_balance_rows": True,
    "balance_row_markers": list(DEFAULT_BALANCE_MARKERS),
    "fnb_preset": True,
}

DISCOVERY_CSV_PRESET: dict[str, Any] = {
    "file_type": "csv",
    "delimiter": ",",
    "encoding": "utf-8",
    "has_header": True,
    "skip_rows": 0,
    "skip_footer_rows": 0,
    "date_format": "%d/%m/%Y",
    "date_column": "Transaction Date",
    "description_column": "Description",
    "amount_column": "Amount",
    "debit_column": None,
    "credit_column": None,
    "balance_column": "Balance",
    "reference_column": "Reference",
    "amount_sign": "normal",
    "amount_style": "signed_rand",
    "debit_is_negative": True,
    "exclude_balance_rows": True,
    "balance_row_markers": list(DEFAULT_BALANCE_MARKERS),
    "discovery_preset": True,
}


def get_preset(bank_type: str) -> dict[str, Any]:
    bt = (bank_type or "").lower().strip()
    if bt in ("fnb", "fnb gold business", "fnb_business", "fnb gold"):
        cal = dict(FNB_CSV_PRESET)
        cal["bank_family"] = "FNB"
        cal["fnb_preset"] = True
        return cal
    if bt in ("discovery", "discovery personal", "discovery_personal", "discovery bank"):
        cal = dict(DISCOVERY_CSV_PRESET)
        cal["bank_family"] = "Discovery"
        cal["discovery_preset"] = True
        return cal
    if bt in ("capitec", "capitec business", "capitec_business"):
        from app.services.parsers.capitec_pdf import CAPITEC_BUSINESS_PRESET

        cal = dict(CAPITEC_BUSINESS_PRESET)
        cal["bank_family"] = "Capitec"
        cal["capitec_preset"] = True
        return cal
    if bt in ("nedbank", "nedbank personal", "nedbank_personal"):
        from app.services.parsers.nedbank_pdf import NEDBANK_PERSONAL_PRESET

        cal = dict(NEDBANK_PERSONAL_PRESET)
        cal["bank_family"] = "Nedbank"
        cal["nedbank_preset"] = True
        return cal
    if bt in ("bank zero", "bankzero", "bank_zero"):
        from app.services.parsers.bank_zero_pdf import BANK_ZERO_PRESET

        cal = dict(BANK_ZERO_PRESET)
        cal["bank_family"] = "Bank Zero"
        cal["bank_zero_preset"] = True
        return cal
    return {
        "file_type": "csv",
        "delimiter": ",",
        "encoding": "utf-8",
        "has_header": True,
        "skip_rows": 0,
        "skip_footer_rows": 0,
        "date_format": "auto",
        "date_column": 0,
        "description_column": 1,
        "amount_column": 2,
        "debit_column": None,
        "credit_column": None,
        "balance_column": None,
        "reference_column": None,
        "amount_sign": "normal",
        "amount_style": "normal",
        "debit_is_negative": True,
        "exclude_balance_rows": True,
        "balance_row_markers": list(DEFAULT_BALANCE_MARKERS),
    }


# Banks we have calibrated and approved for end users (no DIY calibration).
# UI shows brand only (FNB, Discovery, …). Each brand may have several
# internal layouts tried automatically on upload (see `layouts`).
SUPPORTED_BANKS: list[dict[str, Any]] = [
    {
        "id": "discovery",
        "bank_type": "Discovery",
        "label": "Discovery",
        "description": "PDF statements we have calibrated (personal layouts).",
        "suggested_name": "Discovery",
        "formats": "PDF",
        "layouts": [
            {"id": "personal_en", "label": "Personal (English)", "status": "locked"},
        ],
    },
    {
        "id": "fnb",
        "bank_type": "FNB",
        "label": "FNB",
        "description": "PDF statements we have calibrated (business + personal layouts).",
        "suggested_name": "FNB",
        "formats": "PDF",
        "layouts": [
            {"id": "gold_business_en", "label": "Gold Business (English)", "status": "locked"},
            {
                "id": "fusion_private_wealth_af",
                "label": "Fusion Private Wealth (Afrikaans personal)",
                "status": "edition-1",
            },
        ],
    },
    {
        "id": "capitec",
        "bank_type": "Capitec",
        "label": "Capitec",
        "description": "PDF statements we have calibrated (business layouts).",
        "suggested_name": "Capitec",
        "formats": "PDF",
        "layouts": [
            {"id": "business_en", "label": "Business (English)", "status": "locked"},
        ],
    },
    {
        "id": "nedbank",
        "bank_type": "Nedbank",
        "label": "Nedbank",
        "description": "PDF statements we have calibrated (personal layouts).",
        "suggested_name": "Nedbank",
        "formats": "PDF",
        "layouts": [
            {"id": "personal_en", "label": "Personal (English)", "status": "locked"},
        ],
    },
    {
        "id": "bank-zero",
        "bank_type": "Bank Zero",
        "label": "Bank Zero",
        "description": "PDF statements we have calibrated (personal Check Account).",
        "suggested_name": "Bank Zero",
        "formats": "PDF",
        "layouts": [
            {"id": "check_account_en", "label": "Check Account (English)", "status": "edition-1"},
        ],
    },
]


def list_supported_banks() -> list[dict[str, Any]]:
    """Public catalog for brand picker (includes internal layout metadata)."""
    return [dict(row) for row in SUPPORTED_BANKS]


def is_supported_bank_type(bank_type: str) -> bool:
    bt = (bank_type or "").strip().lower()
    return any((row["bank_type"] or "").lower() == bt for row in SUPPORTED_BANKS)


def _resolve_column(row: dict[str, str] | list[str], key: Any) -> Optional[str]:
    if key is None or key == "":
        return None
    if isinstance(row, list):
        try:
            idx = int(key)
            if 0 <= idx < len(row):
                return row[idx]
        except (TypeError, ValueError):
            return None
        return None
    # dict row with header names
    if isinstance(key, int) or (isinstance(key, str) and key.isdigit()):
        keys = list(row.keys())
        idx = int(key)
        if 0 <= idx < len(keys):
            return row[keys[idx]]
        return None
    # Case-insensitive header match
    key_l = str(key).strip().lower()
    for k, v in row.items():
        if k is None:
            continue
        if str(k).strip().lower() == key_l:
            return v
    # Partial match
    for k, v in row.items():
        if k is None:
            continue
        if key_l in str(k).strip().lower():
            return v
    return None


def _parse_date(value: str, fmt: str) -> date:
    value = (value or "").strip()
    if not value:
        raise ValueError("Empty date")
    if fmt and fmt != "auto":
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    # ISO yyyy-mm-dd first (avoid dayfirst mangling)
    for iso in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(value, iso).date()
        except ValueError:
            pass
    # SA banks often use dd/mm/yyyy
    return date_parser.parse(value, dayfirst=True).date()


def _cleanup_description(desc: str, patterns: list[str] | None) -> str:
    desc = re.sub(r"\s+", " ", (desc or "").strip())
    if patterns:
        for p in patterns:
            try:
                desc = re.sub(p, "", desc).strip()
            except re.error:
                continue
    return desc


def _is_balance_row(description: str, cal: dict[str, Any]) -> bool:
    if not cal.get("exclude_balance_rows", True):
        return False
    markers = cal.get("balance_row_markers") or DEFAULT_BALANCE_MARKERS
    d = (description or "").strip().lower()
    if not d:
        return False
    return any(m in d for m in markers if m)


def _build_description(row: dict | list, cal: dict[str, Any]) -> str:
    desc_raw = _resolve_column(row, cal.get("description_column")) or ""
    parts: list[str] = []
    type_raw = _resolve_column(row, cal.get("type_column")) if cal.get("type_column") else None
    if type_raw and str(type_raw).strip():
        parts.append(str(type_raw).strip())
    if str(desc_raw).strip():
        parts.append(str(desc_raw).strip())
    description = " · ".join(parts) if parts else str(desc_raw)
    description = _cleanup_description(description, cal.get("description_cleanup"))

    if cal.get("include_card_number") and cal.get("card_column"):
        card = _resolve_column(row, cal.get("card_column"))
        if card and str(card).strip():
            description = f"{description} [card {str(card).strip()}]".strip()
    return description or "(no description)"


def _amount_from_row(row: dict | list, cal: dict[str, Any]) -> Decimal:
    debit_col = cal.get("debit_column")
    credit_col = cal.get("credit_column")
    amount_col = cal.get("amount_column")
    style = cal.get("amount_style") or "normal"
    if cal.get("amount_sign") == "invert" and style == "normal":
        style = "invert"

    if debit_col is not None or credit_col is not None:
        debit_raw = _resolve_column(row, debit_col) if debit_col is not None else None
        credit_raw = _resolve_column(row, credit_col) if credit_col is not None else None
        debit = to_decimal(debit_raw) if debit_raw not in (None, "") else Decimal("0")
        credit = to_decimal(credit_raw) if credit_raw not in (None, "") else Decimal("0")
        if cal.get("debit_is_negative", True):
            amount = credit - abs(debit)
        else:
            amount = credit + debit
        if style == "invert":
            amount = -amount
        return amount

    raw = _resolve_column(row, amount_col)
    return apply_amount_style(raw, style)


def parse_csv_content(content: bytes | str, calibration: dict[str, Any]) -> list[ParsedTransaction]:
    cal = {**get_preset("Other"), **(calibration or {})}
    encoding = cal.get("encoding") or "utf-8"
    if isinstance(content, bytes):
        text = content.decode(encoding, errors="replace")
    else:
        text = content

    # Strip BOM
    if text.startswith("\ufeff"):
        text = text[1:]

    delimiter = cal.get("delimiter") or ","
    # Auto-detect delimiter if single-column looks wrong
    sample = text[:2048]
    if delimiter == "auto":
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            delimiter = dialect.delimiter
        except csv.Error:
            delimiter = ","

    skip_rows = int(cal.get("skip_rows") or 0)
    skip_footer = int(cal.get("skip_footer_rows") or 0)
    has_header = cal.get("has_header", True)

    reader_lines = text.splitlines()
    if skip_rows:
        reader_lines = reader_lines[skip_rows:]
    if skip_footer and skip_footer > 0:
        reader_lines = reader_lines[:-skip_footer] if len(reader_lines) > skip_footer else reader_lines

    f = io.StringIO("\n".join(reader_lines))
    transactions: list[ParsedTransaction] = []

    if has_header:
        dict_reader = csv.DictReader(f, delimiter=delimiter)
        rows: list[dict | list] = list(dict_reader)
    else:
        plain = csv.reader(f, delimiter=delimiter)
        rows = list(plain)

    for row in rows:
        if not row:
            continue
        # Skip empty rows
        if isinstance(row, dict):
            if not any((v or "").strip() for v in row.values()):
                continue
        else:
            if not any((c or "").strip() for c in row):
                continue

        try:
            date_raw = _resolve_column(row, cal.get("date_column"))
            if not date_raw or not str(date_raw).strip():
                continue
            tx_date = _parse_date(str(date_raw), cal.get("date_format") or "auto")
            description = _build_description(row, cal)
            if _is_balance_row(description, cal):
                continue
            amount = _amount_from_row(row, cal)
            bal_raw = _resolve_column(row, cal.get("balance_column"))
            balance = to_decimal(bal_raw) if bal_raw not in (None, "") else None
            ref_raw = _resolve_column(row, cal.get("reference_column"))
            if cal.get("include_card_number") is False and cal.get("card_column"):
                # Prefer type/ref without forcing card into reference when disabled
                pass
            reference = str(ref_raw).strip() if ref_raw else None
            if (not description or description == "(no description)") and amount == 0:
                continue
            transactions.append(
                ParsedTransaction(
                    date=tx_date,
                    description=description,
                    amount=amount,
                    balance=balance,
                    reference=reference,
                )
            )
        except (ValueError, TypeError, KeyError):
            # Skip unparseable rows (headers, footers, subtotals)
            continue

    return transactions


def parse_pdf_content(content: bytes, calibration: dict[str, Any]) -> list[ParsedTransaction]:
    """Flexible PDF path using pdfplumber tables + calibration.

    Bank-specific text parsers are isolated modules (all LOCKED edition-1):
    - Discovery → discovery_pdf.py (226 txs human-verified 100%)
    - FNB → fnb_pdf.py (1000+ txs human-verified 100%)
    - Capitec → capitec_pdf.py (bulk import TBD)
    - Nedbank → nedbank_pdf.py (bulk import TBD)
    Routing lives here; never share line rules across banks.
    """
    import pdfplumber

    cal = {**get_preset("Other"), **(calibration or {})}
    cal.setdefault("file_type", "pdf")

    # ── Discovery only (edition-1 locked text layout) ─────────────────────
    # Never broaden this branch into a multi-bank "text PDF" parser.
    try:
        from app.services.parsers.discovery_pdf import (
            looks_like_discovery_text,
            parse_discovery_pdf_text,
        )

        with pdfplumber.open(io.BytesIO(content)) as _pdf:
            sample_text = "\n".join((p.extract_text() or "") for p in _pdf.pages[:3])
        use_discovery = (
            cal.get("discovery_preset")
            or cal.get("bank_family") == "Discovery"
            or (cal.get("parser") or "").lower() == "discovery_text"
            or looks_like_discovery_text(sample_text)
        )
        if use_discovery:
            discovered = parse_discovery_pdf_text(content, cal)
            if discovered:
                return discovered
    except Exception:
        # Fall through to generic table/line path
        pass

    # ── FNB Gold Business only (edition-1 locked — never via discovery_pdf) ─
    try:
        from app.services.parsers.fnb_pdf import looks_like_fnb_text, parse_fnb_pdf_text

        with pdfplumber.open(io.BytesIO(content)) as _pdf:
            sample_text_fnb = "\n".join((p.extract_text() or "") for p in _pdf.pages[:3])
        use_fnb = (
            cal.get("fnb_preset")
            or cal.get("bank_family") == "FNB"
            or (cal.get("parser") or "").lower() == "fnb_text"
            or looks_like_fnb_text(sample_text_fnb)
        )
        if use_fnb:
            # Prefer text parser; FNB business tables often have Amount=None.
            # Always force credit_suffix_cr — saved profiles may still say "normal"
            # (bare amount = debit out; Cr = credit in).
            cal_fnb = {
                **cal,
                "amount_style": "credit_suffix_cr",
                "parser": cal.get("parser") or "fnb_text",
                "fnb_preset": True,
            }
            fnb_txs = parse_fnb_pdf_text(content, cal_fnb)
            if fnb_txs:
                return fnb_txs
    except Exception:
        pass

    # ── Capitec Business only (own module — never via Discovery/FNB) ──────
    # Explicit Capitec profiles must not silently fall through to generic tables.
    from app.services.parsers.capitec_pdf import (
        looks_like_capitec_text,
        parse_capitec_pdf_text,
    )

    sample_text_cap = ""
    try:
        with pdfplumber.open(io.BytesIO(content)) as _pdf:
            sample_text_cap = "\n".join((p.extract_text() or "") for p in _pdf.pages[:3])
    except Exception:
        sample_text_cap = ""

    forced_capitec = (
        cal.get("capitec_preset")
        or cal.get("capitec_business")
        or cal.get("bank_family") == "Capitec"
        or (cal.get("parser") or "").lower().startswith("capitec")
        or str(cal.get("bank_type") or "").lower().startswith("capitec")
    )
    use_capitec = forced_capitec or looks_like_capitec_text(sample_text_cap)
    if use_capitec:
        cal_cap = {
            **cal,
            "parser": "capitec_business",
            "capitec_preset": True,
            "capitec_business": True,
            "combine_fees_into_amount": False,
            "bank_family": "Capitec",
        }
        try:
            cap_txs = parse_capitec_pdf_text(content, cal_cap)
            if cap_txs:
                return cap_txs
            # Forced Capitec + 0 rows: only hard-stop if content is not another known bank
            # (wrong profile selected for Nedbank PDF used to return 0 here).
            if forced_capitec:
                from app.services.parsers.nedbank_pdf import looks_like_nedbank_text as _lk_ned

                if not _lk_ned(sample_text_cap):
                    return []
                # else fall through to Nedbank / others
        except Exception:
            if forced_capitec:
                from app.services.parsers.nedbank_pdf import looks_like_nedbank_text as _lk_ned

                if not _lk_ned(sample_text_cap):
                    raise
            # Heuristic-only match: allow generic fallback
            pass

    # ── Nedbank personal current account (own module — never via locked banks) ─
    from app.services.parsers.nedbank_pdf import (
        looks_like_nedbank_text,
        parse_nedbank_pdf_text,
    )

    sample_text_ned = sample_text_cap  # reuse first extract when available
    if not sample_text_ned:
        try:
            with pdfplumber.open(io.BytesIO(content)) as _pdf:
                sample_text_ned = "\n".join((p.extract_text() or "") for p in _pdf.pages[:3])
        except Exception:
            sample_text_ned = ""

    forced_nedbank = (
        cal.get("nedbank_preset")
        or cal.get("bank_family") == "Nedbank"
        or (cal.get("parser") or "").lower().startswith("nedbank")
        or str(cal.get("bank_type") or "").lower().startswith("nedbank")
    )
    use_nedbank = forced_nedbank or looks_like_nedbank_text(sample_text_ned)
    if use_nedbank:
        # Strip other-bank force flags so Nedbank path is clean after mis-selected profile
        cal_ned = {
            **{k: v for k, v in cal.items() if k not in {
                "capitec_preset", "capitec_business", "fnb_preset", "discovery_preset",
            }},
            "parser": "nedbank_text",
            "nedbank_preset": True,
            "bank_family": "Nedbank",
            "capitec_preset": False,
            "capitec_business": False,
            "fnb_preset": False,
            "discovery_preset": False,
        }
        try:
            ned_txs = parse_nedbank_pdf_text(content, cal_ned)
            if ned_txs:
                return ned_txs
            if forced_nedbank:
                return []
        except Exception:
            if forced_nedbank:
                raise
            pass

    # ── Bank Zero (own module — before generic tables; Nedbank is a counterparty name) ─
    from app.services.parsers.bank_zero_pdf import (
        looks_like_bank_zero_text,
        parse_bank_zero_pdf_text,
    )

    sample_text_bz = sample_text_ned
    if not sample_text_bz:
        try:
            with pdfplumber.open(io.BytesIO(content)) as _pdf:
                sample_text_bz = "\n".join((p.extract_text() or "") for p in _pdf.pages[:3])
        except Exception:
            sample_text_bz = ""

    forced_bz = (
        cal.get("bank_zero_preset")
        or cal.get("bank_family") == "Bank Zero"
        or (cal.get("parser") or "").lower().startswith("bank_zero")
        or str(cal.get("bank_type") or "").lower() in {"bank zero", "bankzero"}
    )
    use_bz = forced_bz or looks_like_bank_zero_text(sample_text_bz)
    if use_bz:
        cal_bz = {
            **cal,
            "parser": "bank_zero_text",
            "bank_zero_preset": True,
            "bank_family": "Bank Zero",
        }
        try:
            bz_txs = parse_bank_zero_pdf_text(content, cal_bz)
            if bz_txs:
                return bz_txs
            if forced_bz:
                return []
        except Exception:
            if forced_bz:
                raise
            pass

    # Force column indices for PDF table extraction when headers are messy
    transactions: list[ParsedTransaction] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        all_rows: list[list[str]] = []
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                for row in table:
                    if row:
                        all_rows.append([("" if c is None else str(c)).strip() for c in row])
            # Fallback: line text if no tables
            if not tables:
                text = page.extract_text() or ""
                for line in text.splitlines():
                    parts = re.split(r"\s{2,}|\t", line.strip())
                    if len(parts) >= 3:
                        all_rows.append(parts)

    skip_rows = int(cal.get("skip_rows") or 0)
    skip_footer = int(cal.get("skip_footer_rows") or 0)
    rows = all_rows[skip_rows:]
    if skip_footer:
        rows = rows[:-skip_footer] if len(rows) > skip_footer else rows

    # If has_header, first row is headers – build dict rows
    has_header = cal.get("has_header", True)
    if has_header and rows:
        headers = rows[0]
        data_rows = rows[1:]
        for cells in data_rows:
            row_dict = {
                headers[i] if i < len(headers) else str(i): (cells[i] if i < len(cells) else "")
                for i in range(max(len(headers), len(cells)))
            }
            try:
                date_raw = _resolve_column(row_dict, cal.get("date_column"))
                if not date_raw:
                    date_raw = _resolve_column(cells, cal.get("date_column", 0))
                if not date_raw or not str(date_raw).strip():
                    continue
                tx_date = _parse_date(str(date_raw), cal.get("date_format") or "auto")
                description = _build_description(row_dict, cal)
                if description == "(no description)":
                    description = _build_description(cells, cal)
                if _is_balance_row(description, cal):
                    continue
                amount = _amount_from_row(row_dict, cal)
                if amount == 0:
                    try:
                        amount = _amount_from_row(cells, cal)
                    except Exception:
                        pass
                bal_raw = _resolve_column(row_dict, cal.get("balance_column"))
                balance = to_decimal(bal_raw) if bal_raw not in (None, "") else None
                ref = _resolve_column(row_dict, cal.get("reference_column"))
                transactions.append(
                    ParsedTransaction(
                        date=tx_date,
                        description=description,
                        amount=amount,
                        balance=balance,
                        reference=str(ref).strip() if ref else None,
                    )
                )
            except (ValueError, TypeError, KeyError):
                continue
    else:
        for cells in rows:
            try:
                date_raw = _resolve_column(cells, cal.get("date_column", 0))
                if not date_raw:
                    continue
                tx_date = _parse_date(str(date_raw), cal.get("date_format") or "auto")
                description = _build_description(cells, cal)
                if _is_balance_row(description, cal):
                    continue
                amount = _amount_from_row(cells, cal)
                bal_raw = _resolve_column(cells, cal.get("balance_column"))
                balance = to_decimal(bal_raw) if bal_raw not in (None, "") else None
                ref = _resolve_column(cells, cal.get("reference_column"))
                transactions.append(
                    ParsedTransaction(
                        date=tx_date,
                        description=description,
                        amount=amount,
                        balance=balance,
                        reference=str(ref).strip() if ref else None,
                    )
                )
            except (ValueError, TypeError, KeyError):
                continue

    return transactions


def parse_statement(
    file_path: Path | str,
    calibration: dict[str, Any],
    original_filename: str | None = None,
) -> list[ParsedTransaction]:
    path = Path(file_path)
    content = path.read_bytes()
    cal = dict(calibration or {})
    name = (original_filename or path.name).lower()

    file_type = (cal.get("file_type") or "").lower()
    if not file_type:
        file_type = "pdf" if name.endswith(".pdf") else "csv"

    if file_type == "pdf" or name.endswith(".pdf"):
        return parse_pdf_content(content, cal)
    return parse_csv_content(content, cal)


def preview_file(
    content: bytes,
    filename: str,
    calibration: dict[str, Any] | None = None,
    max_rows: int = 15,
) -> dict[str, Any]:
    """Return raw columns + sample rows + parsed preview for calibration UI."""
    name = filename.lower()
    cal = dict(calibration or {})
    is_pdf = name.endswith(".pdf") or cal.get("file_type") == "pdf"

    if is_pdf:
        cal.setdefault("file_type", "pdf")
        parsed = parse_pdf_content(content, cal)[:max_rows]
        return {
            "columns": ["date", "description", "amount", "balance", "reference"],
            "sample_rows": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                    "balance": str(p.balance) if p.balance is not None else "",
                    "reference": p.reference or "",
                }
                for p in parsed
            ],
            "parsed_preview": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                    "balance": str(p.balance) if p.balance is not None else None,
                    "reference": p.reference,
                }
                for p in parsed
            ],
            "detected_format": "pdf",
            "message": f"Parsed {len(parsed)} sample row(s) from PDF.",
        }

    # CSV preview
    encoding = cal.get("encoding") or "utf-8"
    text = content.decode(encoding, errors="replace")
    if text.startswith("\ufeff"):
        text = text[1:]
    delimiter = cal.get("delimiter") or ","
    if delimiter == "auto":
        try:
            delimiter = csv.Sniffer().sniff(text[:2048], delimiters=",;\t|").delimiter
        except csv.Error:
            delimiter = ","

    f = io.StringIO(text)
    reader = csv.reader(f, delimiter=delimiter)
    all_rows = list(reader)
    skip = int(cal.get("skip_rows") or 0)
    all_rows = all_rows[skip:]
    headers = all_rows[0] if all_rows and cal.get("has_header", True) else [
        str(i) for i in range(len(all_rows[0]) if all_rows else 0)
    ]
    data_start = 1 if cal.get("has_header", True) else 0
    sample_rows = []
    for row in all_rows[data_start : data_start + max_rows]:
        sample_rows.append(
            {headers[i] if i < len(headers) else str(i): (row[i] if i < len(row) else "") for i in range(len(headers))}
        )

    parsed = parse_csv_content(content, cal)[:max_rows]
    return {
        "columns": headers,
        "sample_rows": sample_rows,
        "parsed_preview": [
            {
                "date": str(p.date),
                "description": p.description,
                "amount": str(p.amount),
                "balance": str(p.balance) if p.balance is not None else None,
                "reference": p.reference,
            }
            for p in parsed
        ],
        "detected_format": "csv",
        "message": f"Detected {len(headers)} columns; parsed {len(parsed)} sample transaction(s).",
    }
