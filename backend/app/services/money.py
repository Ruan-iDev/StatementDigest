"""Decimal money helpers – never use float for currency."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re


TWOPLACES = Decimal("0.01")


def to_decimal(value: object) -> Decimal:
    """Parse common bank amount strings into Decimal.

    Handles: 1,234.56 | 1 234.56 | (123.45) | R1,234.56 | -R 50.00 |
             1234.56 Cr | 1234.56CR | -1234.56 | 1234,56
    """
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    if isinstance(value, int):
        return Decimal(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    if isinstance(value, float):
        return Decimal(str(value)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)

    s = str(value).strip()
    if not s:
        return Decimal("0")

    negative = False
    is_credit = False

    # Accounting negatives in parentheses
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1].strip()

    # FNB-style trailing Cr / CR / Credit (inflow)
    cr_match = re.search(r"\b(cr|credit)\b\.?$", s, flags=re.IGNORECASE)
    if cr_match:
        is_credit = True
        s = s[: cr_match.start()].strip()
    # Also "123.45Cr" without space
    elif re.search(r"(?i)cr\.?$", s) and not re.search(r"(?i)card", s):
        is_credit = True
        s = re.sub(r"(?i)cr\.?$", "", s).strip()

    # Explicit leading minus before currency (Discovery-style "-R 50.00")
    if re.match(r"^[\-−–]", s):
        negative = True
        s = s[1:].strip()

    # Strip currency symbols and spaces (keep digits, separators, sign already handled)
    s = re.sub(r"[R$€£\s]", "", s, flags=re.IGNORECASE)

    if s.startswith("-") or s.startswith("−"):
        negative = True
        s = s[1:]
    elif s.startswith("+"):
        s = s[1:]

    # European-style 1.234,56 → 1234.56
    if re.match(r"^-?\d{1,3}(\.\d{3})+,\d{2}$", s):
        s = s.replace(".", "").replace(",", ".")
    elif "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s and "." not in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")

    try:
        d = Decimal(s).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Cannot parse amount: {value!r}") from exc

    d = abs(d)
    if is_credit:
        return d  # inflow
    if negative:
        return -d
    return d


def apply_amount_style(raw: object, amount_style: str | None) -> Decimal:
    """Parse amount applying bank-specific sign conventions.

    amount_style:
      - normal | signed_rand: use to_decimal (minus / R / parentheses)
      - credit_suffix_cr: bare amounts are outflows; Cr suffix = inflow
      - invert: flip sign after normal parse
    """
    style = (amount_style or "normal").lower()
    text = str(raw or "").strip()

    if style in ("credit_suffix_cr", "fnb_cr"):
        has_cr = bool(re.search(r"(?i)\bcr\b|\bcredit\b|cr\.?$", text))
        # Strip Cr for magnitude
        cleaned = re.sub(r"(?i)\b(cr|credit)\b\.?", "", text).strip()
        mag = abs(to_decimal(cleaned if cleaned else text))
        return mag if has_cr else -mag

    d = to_decimal(raw)
    if style == "invert":
        return -d
    # signed_rand / normal / discovery: to_decimal already handles -R
    return d


def quantize_money(d: Decimal) -> Decimal:
    return d.quantize(TWOPLACES, rounding=ROUND_HALF_UP)
