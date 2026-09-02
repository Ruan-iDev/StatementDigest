"""Auto-dissect a sample statement for the Bank Profile wizard.

Returns friendly, non-technical findings plus a calibration recipe.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any, Optional

from app.services.money import apply_amount_style, to_decimal
from app.services.parsers.base import (
    DISCOVERY_CSV_PRESET,
    FNB_CSV_PRESET,
    get_preset,
    parse_csv_content,
    parse_pdf_content,
)

# Column name heuristics
DATE_HINTS = ("date", "transaction date", "trans date", "posting date", "value date")
DESC_HINTS = ("description", "details", "narrative", "particulars", "transaction description", "memo")
AMOUNT_HINTS = ("amount", "transaction amount", "value", "amt")
DEBIT_HINTS = ("debit", "withdrawal", "payments", "money out")
CREDIT_HINTS = ("credit", "deposit", "receipts", "money in")
BALANCE_HINTS = ("balance", "running balance", "available")
REF_HINTS = ("reference", "ref", "cheque", "check no")
TYPE_HINTS = ("type", "txn type", "transaction type")
CARD_HINTS = ("card", "card no", "card number", "card #")

BALANCE_ROW_MARKERS = (
    "opening balance",
    "closing balance",
    "balance brought forward",
    "balance carried forward",
    "b/f",
    "c/f",
)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _match_header(headers: list[str], hints: tuple[str, ...]) -> Optional[str]:
    norms = {_norm(h): h for h in headers if h}
    for hint in hints:
        for n, original in norms.items():
            if n == hint or hint in n:
                return original
    return None


def _looks_like_date(val: str) -> bool:
    v = (val or "").strip()
    if not v:
        return False
    return bool(
        re.match(r"^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$", v)
        or re.match(r"^\d{1,2}\s+[A-Za-z]{3}", v)
    )


def _detect_amount_style(samples: list[str]) -> str:
    """Infer amount_style from raw amount cell samples."""
    cr_hits = 0
    minus_hits = 0
    r_hits = 0
    for s in samples:
        t = (s or "").strip()
        if not t:
            continue
        if re.search(r"(?i)\bcr\b|cr\.?$", t):
            cr_hits += 1
        if re.match(r"^[\-−–]", t) or re.search(r"[\-−–]\s*R", t, re.I):
            minus_hits += 1
        if re.search(r"(?i)\bR\b|^R", t):
            r_hits += 1
    if cr_hits >= 1 and cr_hits >= minus_hits:
        return "credit_suffix_cr"
    if minus_hits >= 1 or r_hits >= 2:
        return "signed_rand"
    return "normal"


def _guess_bank_type(filename: str, headers: list[str], text_sample: str) -> str:
    # Filename wins (user often names files by bank)
    fn = (filename or "").lower()
    if "discovery" in fn:
        return "Discovery"
    if "fnb" in fn or "first_national" in fn or "first-national" in fn:
        return "FNB"
    if "capitec" in fn:
        return "Capitec"
    if "nedbank" in fn:
        return "Nedbank"
    if "standard" in fn and "bank" in fn:
        return "Other"

    headers_blob = " ".join(_norm(h) for h in headers)
    # Discovery timeline shape: Date | Card | Type | Details | Amount
    if "card" in headers_blob and "details" in headers_blob and "type" in headers_blob:
        return "Discovery"
    # Capitec Business table shape
    if "fees" in headers_blob and "post" in headers_blob and "amount" in headers_blob:
        return "Capitec"

    body = (text_sample or "")[:3000].lower()
    # Prefer explicit bank branding in header text over merchant names in rows
    headerish = body[:800]
    if "discovery bank" in headerish or "discovery card" in headerish:
        return "Discovery"
    if "first national bank" in headerish or "fnb " in headerish:
        return "FNB"
    if "capitec" in headerish:
        return "Capitec"
    if "nedbank" in headerish or "nedbank.co.za" in headerish.replace(" ", ""):
        return "Nedbank"

    if "discovery" in body and "fnb" not in fn:
        # Weak signal only if filename didn't say otherwise
        if body.count("discovery") >= 2:
            return "Discovery"
    if "capitec" in body:
        return "Capitec"
    if "nedbank" in body:
        return "Nedbank"
    if "fnb" in body:
        return "FNB"
    return "Other"


def _suggested_name(filename: str, bank_type: str) -> str:
    base = re.sub(r"\.[^.]+$", "", filename or "statement")
    base = re.sub(r"[_\-]+", " ", base).strip()
    if bank_type and bank_type != "Other":
        return bank_type if not base else f"{bank_type}"
    return base[:80] or "My bank"


def _detect_csv(content: bytes, filename: str) -> dict[str, Any]:
    text = content.decode("utf-8", errors="replace")
    if text.startswith("\ufeff"):
        text = text[1:]

    try:
        delimiter = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|").delimiter
    except csv.Error:
        delimiter = ","

    # Find header row (first row with 2+ date-ish or known header words)
    reader = list(csv.reader(io.StringIO(text), delimiter=delimiter))
    skip_rows = 0
    headers: list[str] = []
    for i, row in enumerate(reader[:40]):
        cells = [c.strip() for c in row]
        if not any(cells):
            continue
        lower = " ".join(_norm(c) for c in cells)
        if any(h in lower for h in ("date", "description", "amount", "details", "balance")):
            headers = cells
            skip_rows = i
            break
    if not headers and reader:
        headers = [c.strip() for c in reader[0]]
        skip_rows = 0

    data_rows = reader[skip_rows + 1 : skip_rows + 25] if headers else []
    date_col = _match_header(headers, DATE_HINTS) or (headers[0] if headers else "Date")
    desc_col = (
        _match_header(headers, DESC_HINTS)
        or _match_header(headers, TYPE_HINTS)
        or (headers[1] if len(headers) > 1 else "Description")
    )
    # Prefer single amount column; else debit/credit
    amount_col = _match_header(headers, AMOUNT_HINTS)
    debit_col = _match_header(headers, DEBIT_HINTS)
    credit_col = _match_header(headers, CREDIT_HINTS)
    balance_col = _match_header(headers, BALANCE_HINTS)
    ref_col = _match_header(headers, REF_HINTS)
    type_col = _match_header(headers, TYPE_HINTS)
    card_col = _match_header(headers, CARD_HINTS)

    amount_samples: list[str] = []
    if amount_col and headers:
        idx = headers.index(amount_col) if amount_col in headers else -1
        for row in data_rows:
            if 0 <= idx < len(row):
                amount_samples.append(row[idx])
    amount_style = _detect_amount_style(amount_samples)

    bank_type = _guess_bank_type(filename, headers, text)
    if bank_type == "FNB":
        base = dict(FNB_CSV_PRESET)
    elif bank_type == "Discovery":
        base = dict(DISCOVERY_CSV_PRESET)
    else:
        base = get_preset("Other")

    cal: dict[str, Any] = {
        **base,
        "file_type": "csv",
        "delimiter": delimiter,
        "has_header": True,
        "skip_rows": skip_rows,
        "date_format": "auto",
        "date_column": date_col,
        "description_column": desc_col,
        "amount_column": amount_col,
        "debit_column": debit_col if not amount_col else None,
        "credit_column": credit_col if not amount_col else None,
        "balance_column": balance_col,
        "reference_column": ref_col or card_col,
        "type_column": type_col,
        "card_column": card_col,
        "amount_style": amount_style if amount_style != "normal" else base.get("amount_style", "normal"),
        "exclude_balance_rows": True,
        "balance_row_markers": list(BALANCE_ROW_MARKERS),
        "include_personal_details": False,
        "include_account_number": False,
        "include_card_number": bool(card_col),
    }
    if amount_style == "credit_suffix_cr":
        cal["amount_style"] = "credit_suffix_cr"
        cal["fnb_preset"] = True
    if amount_style == "signed_rand" or bank_type == "Discovery":
        cal["amount_style"] = cal.get("amount_style") or "signed_rand"
        cal["discovery_preset"] = bank_type == "Discovery"

    # If no amount column but debit/credit, clear amount
    if not amount_col and (debit_col or credit_col):
        cal["amount_column"] = None

    detected_columns = [
        {"name": h, "role": _role_for_header(h, cal)} for h in headers if h
    ]

    options = _build_options(cal, has_card=bool(card_col), is_pdf=False)
    return {
        "bank_type": bank_type,
        "suggested_name": _suggested_name(filename, bank_type),
        "detected_format": "csv",
        "calibration": cal,
        "columns": headers,
        "detected_columns": detected_columns,
        "options": options,
        "message": (
            f"Found a table with {len(headers)} column(s). "
            f"We think this looks like {bank_type if bank_type != 'Other' else 'a bank export'}."
        ),
    }


def _role_for_header(header: str, cal: dict[str, Any]) -> str:
    h = header
    mapping = [
        ("date_column", "Date"),
        ("description_column", "Details / description"),
        ("amount_column", "Amount"),
        ("debit_column", "Debit (out)"),
        ("credit_column", "Credit (in)"),
        ("balance_column", "Balance"),
        ("reference_column", "Reference"),
        ("type_column", "Type"),
        ("card_column", "Card number"),
    ]
    for key, label in mapping:
        val = cal.get(key)
        if val is not None and _norm(str(val)) == _norm(h):
            return label
    return "Other / ignored"


def _build_options(cal: dict[str, Any], has_card: bool, is_pdf: bool) -> list[dict[str, Any]]:
    opts = [
        {
            "key": "include_personal_details",
            "label": "Keep personal details & bank account number with this profile?",
            "help": "Recommended: No — we only need the transaction list for bookkeeping.",
            "default": False,
            "type": "yes_no",
        },
        {
            "key": "include_card_number",
            "label": "Show card number with each transaction?",
            "help": "Only if your statement has a card column and you want it visible.",
            "default": False if not has_card else bool(cal.get("include_card_number")),
            "type": "yes_no",
            "visible": has_card or is_pdf,
        },
    ]
    return opts


def _detect_pdf(content: bytes, filename: str) -> dict[str, Any]:
    import pdfplumber

    from app.services.parsers.discovery_pdf import (
        looks_like_discovery_text,
        parse_discovery_pdf_text,
    )

    all_rows: list[list[str]] = []
    full_text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            full_text_parts.append(page.extract_text() or "")
            tables = page.extract_tables() or []
            for table in tables:
                for row in table:
                    if row:
                        all_rows.append([("" if c is None else str(c)).strip() for c in row])
            if not tables:
                text = page.extract_text() or ""
                for line in text.splitlines():
                    parts = re.split(r"\s{2,}|\t", line.strip())
                    if len(parts) >= 3:
                        all_rows.append(parts)

    full_text = "\n".join(full_text_parts)

    # Capitec Business (Fees + Amount combined on each line)
    from app.services.parsers.capitec_pdf import (
        CAPITEC_BUSINESS_PRESET,
        looks_like_capitec_text,
        parse_capitec_pdf_text,
    )

    if looks_like_capitec_text(full_text) or "capitec" in (filename or "").lower():
        cal_cap: dict[str, Any] = dict(CAPITEC_BUSINESS_PRESET)
        headers_cap = [
            "Post Date",
            "Trans. Date",
            "Description",
            "Reference",
            "Fees",
            "Amount",
            "Balance",
        ]
        cal_cap_roles = {
            **cal_cap,
            "date_column": "Post Date",
            "description_column": "Description",
            "reference_column": "Reference",
            "amount_column": "Amount",
            "balance_column": "Balance",
        }
        detected_columns = [
            {"name": h, "role": _role_for_header(h, cal_cap_roles)} for h in headers_cap
        ]
        options = _build_options(cal_cap, has_card=False, is_pdf=True)
        try:
            parsed_cap = parse_capitec_pdf_text(content, cal_cap)[:12]
        except Exception:
            parsed_cap = []
        return {
            "bank_type": "Capitec",
            "suggested_name": _suggested_name(filename, "Capitec"),
            "detected_format": "pdf",
            "calibration": cal_cap,
            "columns": headers_cap,
            "detected_columns": detected_columns,
            "options": options,
            "parsed_preview": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                    "balance": str(p.balance) if p.balance is not None else None,
                    "reference": p.reference,
                }
                for p in parsed_cap
            ],
            "sample_rows": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                }
                for p in parsed_cap[:5]
            ],
            "message": (
                "Capitec Business statement detected. "
                f"Found {len(parsed_cap)} sample transaction(s). "
                "Amount matches the statement Amount column (fees are NOT added on top). "
                "Where a fee exists, the app shows Fee: [value] left of the transaction amount on the same line. "
                "Fee Total / VAT Total footers are not imported as separate lines."
            ),
        }

    # Bank Zero (must run before Nedbank — "Nedbank" appears as a counterparty)
    from app.services.parsers.bank_zero_pdf import (
        BANK_ZERO_PRESET,
        looks_like_bank_zero_text,
        parse_bank_zero_pdf_text,
    )

    fn = (filename or "").lower()
    if looks_like_bank_zero_text(full_text) or "bank zero" in fn or "bankzero" in fn.replace(" ", ""):
        cal_bz: dict[str, Any] = dict(BANK_ZERO_PRESET)
        headers_bz = ["Date", "Description", "Amount", "Balance"]
        cal_bz_roles = {
            **cal_bz,
            "date_column": "Date",
            "description_column": "Description",
            "amount_column": "Amount",
            "balance_column": "Balance",
        }
        detected_columns = [
            {"name": h, "role": _role_for_header(h, cal_bz_roles)} for h in headers_bz
        ]
        options = _build_options(cal_bz, has_card=False, is_pdf=True)
        try:
            parsed_bz = parse_bank_zero_pdf_text(content, cal_bz)[:12]
        except Exception:
            parsed_bz = []
        return {
            "bank_type": "Bank Zero",
            "suggested_name": _suggested_name(filename, "Bank Zero"),
            "detected_format": "pdf",
            "calibration": cal_bz,
            "columns": headers_bz,
            "detected_columns": detected_columns,
            "options": options,
            "parsed_preview": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                    "balance": str(p.balance) if p.balance is not None else None,
                    "reference": p.reference,
                }
                for p in parsed_bz
            ],
            "sample_rows": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                }
                for p in parsed_bz[:5]
            ],
            "message": (
                "Bank Zero statement detected. "
                f"Found {len(parsed_bz)} sample transaction(s). "
                "Amount is signed (in positive, spend negative). "
                "Admin fees on a payment stay as a Bank Fee on that line."
            ),
        }

    # Nedbank personal current account (text tran list)
    from app.services.parsers.nedbank_pdf import (
        NEDBANK_PERSONAL_PRESET,
        looks_like_nedbank_text,
        parse_nedbank_pdf_text,
    )

    if looks_like_nedbank_text(full_text) or "nedbank" in (filename or "").lower():
        cal_ned: dict[str, Any] = dict(NEDBANK_PERSONAL_PRESET)
        headers_ned = [
            "Tranlistno",
            "Date",
            "Description",
            "Fees(R)",
            "Debits(R)",
            "Credits(R)",
            "Balance(R)",
        ]
        cal_ned_roles = {
            **cal_ned,
            "date_column": "Date",
            "description_column": "Description",
            "amount_column": "Debits(R)",
            "balance_column": "Balance(R)",
        }
        detected_columns = [
            {"name": h, "role": _role_for_header(h, cal_ned_roles)} for h in headers_ned
        ]
        options = _build_options(cal_ned, has_card=False, is_pdf=True)
        try:
            parsed_ned = parse_nedbank_pdf_text(content, cal_ned)[:12]
        except Exception:
            parsed_ned = []
        return {
            "bank_type": "Nedbank",
            "suggested_name": _suggested_name(filename, "Nedbank"),
            "detected_format": "pdf",
            "calibration": cal_ned,
            "columns": headers_ned,
            "detected_columns": detected_columns,
            "options": options,
            "parsed_preview": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                    "balance": str(p.balance) if p.balance is not None else None,
                    "reference": p.reference,
                }
                for p in parsed_ned
            ],
            "sample_rows": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                }
                for p in parsed_ned[:5]
            ],
            "message": (
                "Nedbank statement detected. "
                f"Found {len(parsed_ned)} sample transaction(s). "
                "Debits are negative, credits positive. "
                "Fees marked with * are separate fee lines. "
                "Opening/closing balance rows are excluded."
            ),
        }

    # FNB PDFs (Gold Business etc.): tables often broken; use dedicated text parser
    from app.services.parsers.fnb_pdf import looks_like_fnb_text, parse_fnb_pdf_text

    if looks_like_fnb_text(full_text) or (
        "fnb" in (filename or "").lower() and "discovery" not in (filename or "").lower()
    ):
        cal_fnb: dict[str, Any] = {
            **get_preset("FNB"),
            "file_type": "pdf",
            "parser": "fnb_text",
            "fnb_preset": True,
            "bank_family": "FNB",
            "has_header": True,
            "date_format": "auto",
            "date_column": "Date",
            "description_column": "Description",
            "amount_column": "Amount",
            "balance_column": "Balance",
            "amount_style": "credit_suffix_cr",
            "exclude_balance_rows": True,
            "balance_row_markers": list(BALANCE_ROW_MARKERS),
            "skip_header_regions": True,
            "skip_footer": True,
            "include_personal_details": False,
            "include_account_number": False,
            "include_card_number": False,
        }
        headers_fnb = ["Date", "Description", "Amount", "Balance"]
        detected_columns = [
            {"name": h, "role": _role_for_header(h, cal_fnb)} for h in headers_fnb
        ]
        options = _build_options(cal_fnb, has_card=False, is_pdf=True)
        try:
            parsed_fnb = parse_fnb_pdf_text(content, cal_fnb)[:12]
        except Exception:
            parsed_fnb = []
        return {
            "bank_type": "FNB",
            "suggested_name": _suggested_name(filename, "FNB"),
            "detected_format": "pdf",
            "calibration": cal_fnb,
            "columns": headers_fnb,
            "detected_columns": detected_columns,
            "options": options,
            "parsed_preview": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                    "balance": str(p.balance) if p.balance is not None else None,
                    "reference": p.reference,
                }
                for p in parsed_fnb
            ],
            "sample_rows": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                }
                for p in parsed_fnb[:5]
            ],
            "message": (
                "FNB statement detected (text layout). "
                f"Found {len(parsed_fnb)} sample transaction(s). "
                "Cr amounts are credits (in); bare amounts are debits (out). "
                "Year is taken from Statement Period when days omit the year."
            ),
        }

    # Discovery PDFs: no tables — use dedicated text parser for wizard preview
    if looks_like_discovery_text(full_text) or "discovery" in (filename or "").lower():
        cal: dict[str, Any] = {
            **get_preset("Discovery"),
            "file_type": "pdf",
            "parser": "discovery_text",
            "discovery_preset": True,
            "bank_family": "Discovery",
            "has_header": True,
            "date_format": "auto",
            "date_column": "Date",
            "description_column": "Details",
            "amount_column": "Amount",
            "type_column": "Type",
            "card_column": "Card no.",
            "amount_style": "signed_rand",
            "exclude_balance_rows": True,
            "balance_row_markers": list(BALANCE_ROW_MARKERS),
            "skip_header_regions": True,
            "skip_footer": True,
            "include_personal_details": False,
            "include_account_number": False,
            "include_card_number": False,
        }
        headers = ["Date", "Card no.", "Type", "Details", "Amount"]
        detected_columns = [{"name": h, "role": _role_for_header(h, cal)} for h in headers]
        options = _build_options(cal, has_card=True, is_pdf=True)
        try:
            parsed = parse_discovery_pdf_text(content, cal)[:12]
        except Exception:
            parsed = []
        return {
            "bank_type": "Discovery",
            "suggested_name": _suggested_name(filename, "Discovery"),
            "detected_format": "pdf",
            "calibration": cal,
            "columns": headers,
            "detected_columns": detected_columns,
            "options": options,
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
            "sample_rows": [
                {
                    "date": str(p.date),
                    "description": p.description,
                    "amount": str(p.amount),
                }
                for p in parsed[:5]
            ],
            "message": (
                "Discovery statement detected (text layout, not a spreadsheet table). "
                f"Found {len(parsed)} sample transaction(s) in the timeline. "
                "Personal header and footer are skipped."
            ),
        }
    # Find transaction header row
    header_idx = None
    headers: list[str] = []
    for i, row in enumerate(all_rows[:80]):
        joined = " ".join(_norm(c) for c in row if c)
        if "date" in joined and ("amount" in joined or "details" in joined or "description" in joined):
            headers = [c for c in row if c is not None]
            header_idx = i
            break

    if header_idx is None and all_rows:
        # Fallback first non-empty wide row
        for i, row in enumerate(all_rows):
            if sum(1 for c in row if c) >= 3:
                headers = row
                header_idx = i
                break

    bank_type = _guess_bank_type(filename, headers, full_text)
    has_card = any("card" in _norm(h) for h in headers)

    # Map Discovery-style: Date | Card No | Type | Details | Amount
    date_col = _match_header(headers, DATE_HINTS) or (headers[0] if headers else "Date")
    card_col = _match_header(headers, CARD_HINTS)
    type_col = _match_header(headers, TYPE_HINTS)
    desc_col = _match_header(headers, DESC_HINTS) or (
        headers[3] if len(headers) > 3 else (headers[1] if len(headers) > 1 else "Details")
    )
    amount_col = _match_header(headers, AMOUNT_HINTS) or (headers[-1] if headers else "Amount")

    amount_samples: list[str] = []
    if header_idx is not None and amount_col in headers:
        aidx = headers.index(amount_col)
        for row in all_rows[header_idx + 1 : header_idx + 30]:
            if aidx < len(row):
                amount_samples.append(row[aidx])
    amount_style = _detect_amount_style(amount_samples)
    if bank_type == "Discovery" and amount_style == "normal":
        amount_style = "signed_rand"

    cal: dict[str, Any] = {
        **get_preset(bank_type),
        "file_type": "pdf",
        "has_header": True,
        "skip_rows": header_idx or 0,
        "date_format": "auto",
        "date_column": date_col,
        "description_column": desc_col,
        "amount_column": amount_col,
        "debit_column": None,
        "credit_column": None,
        "balance_column": _match_header(headers, BALANCE_HINTS),
        "reference_column": card_col,
        "type_column": type_col,
        "card_column": card_col,
        "amount_style": amount_style,
        "exclude_balance_rows": True,
        "balance_row_markers": list(BALANCE_ROW_MARKERS),
        "skip_header_regions": True,
        "skip_footer": True,
        "include_personal_details": False,
        "include_account_number": False,
        "include_card_number": False,
        "discovery_preset": bank_type == "Discovery",
        "fnb_preset": bank_type == "FNB",
    }

    detected_columns = [{"name": h, "role": _role_for_header(h, cal)} for h in headers if h]
    options = _build_options(cal, has_card=has_card, is_pdf=True)

    return {
        "bank_type": bank_type,
        "suggested_name": _suggested_name(filename, bank_type),
        "detected_format": "pdf",
        "calibration": cal,
        "columns": headers,
        "detected_columns": detected_columns,
        "options": options,
        "message": (
            "We looked past the account header and summary, and focused on the transaction table. "
            f"Columns found: {', '.join(headers) if headers else 'none yet'}."
        ),
    }


def dissect_statement(content: bytes, filename: str) -> dict[str, Any]:
    """Main entry: dissect sample file for the profile wizard."""
    name = (filename or "sample.csv").lower()
    if name.endswith(".pdf"):
        result = _detect_pdf(content, filename)
    else:
        result = _detect_csv(content, filename)

    cal = result["calibration"]
    # Build parsed preview with balance-row exclusion
    try:
        if result["detected_format"] == "pdf":
            parsed = parse_pdf_content(content, cal)[:12]
        else:
            parsed = parse_csv_content(content, cal)[:12]
    except Exception as exc:
        parsed = []
        result["message"] = f"{result['message']} Preview warning: {exc}"

    result["parsed_preview"] = [
        {
            "date": str(p.date),
            "description": p.description,
            "amount": str(p.amount),
            "balance": str(p.balance) if p.balance is not None else None,
            "reference": p.reference,
        }
        for p in parsed
    ]
    result["sample_rows"] = result.get("sample_rows") or [
        {
            "date": str(p.date),
            "description": p.description,
            "amount": str(p.amount),
        }
        for p in parsed[:5]
    ]
    if not parsed:
        result["message"] += (
            " We could not read sample transactions yet — check the file or adjust options after save."
        )
    else:
        result["message"] += f" Preview shows {len(parsed)} transaction(s)."

    return result
