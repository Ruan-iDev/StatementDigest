"""Build PDF letterhead context from a user profile (business logo + contact block)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.config import DATA_DIR
from app.models import UserProfile


@dataclass
class PdfLetterhead:
    profile_type: str
    title_name: str
    subtitle: Optional[str] = None
    lines: list[str] = field(default_factory=list)
    logo_abs_path: Optional[Path] = None


def resolve_logo_path(logo_path: Optional[str]) -> Optional[Path]:
    if not logo_path:
        return None
    p = Path(logo_path)
    if not p.is_absolute():
        p = DATA_DIR / logo_path
    if p.is_file():
        return p
    return None


def letterhead_from_profile(profile: Optional[UserProfile]) -> Optional[PdfLetterhead]:
    if not profile:
        return None

    ptype = (getattr(profile, "profile_type", None) or "individual").lower()
    is_business = ptype == "business"

    if is_business:
        title = (
            (profile.business_name or "").strip()
            or (profile.full_name or "").strip()
            or (profile.name or "").strip()
            or "Business"
        )
        subtitle = (profile.name or "").strip() if profile.name and profile.name != title else None
    else:
        title = (
            (profile.full_name or "").strip()
            or (profile.name or "").strip()
            or "Personal"
        )
        subtitle = None

    lines: list[str] = []
    for part in (
        profile.address_line1,
        profile.address_line2,
        " ".join(x for x in [profile.city, profile.postal_code] if x).strip() or None,
        profile.country,
    ):
        if part and str(part).strip():
            lines.append(str(part).strip())
    contact = " · ".join(
        x for x in [profile.phone, profile.email] if x and str(x).strip()
    )
    if contact:
        lines.append(contact)
    if is_business:
        reg = getattr(profile, "business_registration_number", None)
        if reg and str(reg).strip():
            lines.append(f"Reg. no: {str(reg).strip()}")
        vat = getattr(profile, "vat_number", None)
        if vat and str(vat).strip():
            lines.append(f"VAT no: {str(vat).strip()}")
        # Legacy single tax field if still used and VAT not set
        if profile.tax_number and str(profile.tax_number).strip() and not (
            vat and str(vat).strip()
        ):
            lines.append(f"Tax ref: {profile.tax_number.strip()}")
    elif profile.tax_number and str(profile.tax_number).strip():
        lines.append(f"Tax ref: {profile.tax_number.strip()}")

    logo = resolve_logo_path(getattr(profile, "logo_path", None)) if is_business else None

    # Skip empty letterhead (nothing useful to print)
    if not title and not lines and not logo:
        return None

    return PdfLetterhead(
        profile_type=ptype,
        title_name=title,
        subtitle=subtitle,
        lines=lines,
        logo_abs_path=logo,
    )
