"""Quote / invoice templates and Practice branding (logo). Isolated from core."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import DATA_DIR, ensure_data_dirs
from app.database import get_db
from app.deps import get_active_profile, get_active_profile_id
from app.models import UserProfile
from app.modules.practice.flags import get_or_create_settings
from app.modules.practice.models import PracticeDocument, PracticeTemplate
from app.modules.practice.schemas import (
    AddressCard,
    BrandingOut,
    IssuerDetails,
    IssuerUpdate,
    TemplateOut,
    TemplateUpdate,
    VatUpdate,
)
from app.services.money import to_decimal

router = APIRouter()

_ALLOWED_LOGO = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_MAX_LOGO = 3 * 1024 * 1024
_KINDS = ("quote", "invoice", "rfq")


def default_prefix(kind: str) -> str:
    if kind == "invoice":
        return "INV"
    if kind == "rfq":
        return "RFQ"
    return "QTE"


def format_number(prefix: str, width: int, n: int) -> str:
    w = max(int(width or 3), len(str(max(n, 1))))
    return f"{prefix}-{n:0{w}d}"


def parse_number_code(code: str | None, kind: str) -> tuple[str, int, int]:
    """Parse 'QTE-001' → (QTE, 3, 1)."""
    fallback = default_prefix(kind)
    raw = (code or "").strip().upper()
    if not raw:
        return fallback, 3, 1
    m = re.match(r"^([A-Z][A-Z0-9]*)\s*[- ]\s*(\d+)$", raw)
    if m:
        digits = m.group(2)
        return m.group(1), max(len(digits), 3), max(int(digits), 1)
    m = re.match(r"^([A-Z][A-Z0-9]*)(\d+)$", raw)
    if m:
        digits = m.group(2)
        return m.group(1), max(len(digits), 3), max(int(digits), 1)
    m = re.match(r"^([A-Z][A-Z0-9]*)$", raw)
    if m:
        return m.group(1), 3, 1
    return fallback, 3, 1


def extract_seq(number: str, prefix: str) -> int | None:
    raw = (number or "").strip().upper()
    pre = prefix.upper()
    m = re.match(rf"^{re.escape(pre)}\s*[- ]?\s*(\d+)$", raw)
    if not m:
        return None
    return int(m.group(1))


def peek_number(db: Session, profile_id: int, kind: str) -> str:
    tmpl = get_or_create_template(db, profile_id, kind)
    prefix = (tmpl.number_prefix or default_prefix(kind)).strip().upper() or default_prefix(kind)
    width = int(tmpl.number_width or 3)
    nxt = int(tmpl.number_next or 1)
    max_n = nxt - 1
    rows = (
        db.query(PracticeDocument.number)
        .filter(PracticeDocument.user_profile_id == profile_id, PracticeDocument.kind == kind)
        .all()
    )
    for (num,) in rows:
        seq = extract_seq(num or "", prefix)
        if seq is not None:
            max_n = max(max_n, seq)
    return format_number(prefix, width, max_n + 1)


def take_number(db: Session, profile_id: int, kind: str) -> str:
    tmpl = get_or_create_template(db, profile_id, kind)
    assigned = peek_number(db, profile_id, kind)
    seq = extract_seq(assigned, tmpl.number_prefix or default_prefix(kind)) or int(tmpl.number_next or 1)
    tmpl.number_next = seq + 1
    tmpl.updated_at = datetime.utcnow()
    return assigned


def _template_out(row: PracticeTemplate) -> TemplateOut:
    prefix = (row.number_prefix or default_prefix(row.kind)).strip().upper() or default_prefix(row.kind)
    width = int(row.number_width or 3)
    nxt = int(row.number_next or 1)
    return TemplateOut(
        kind=row.kind,
        number_code=format_number(prefix, width, nxt),
        number_prefix=prefix,
        number_width=width,
        number_next=nxt,
        bank_name=row.bank_name,
        bank_account_name=row.bank_account_name,
        bank_account_number=row.bank_account_number,
        bank_branch_code=row.bank_branch_code,
        bank_extra=row.bank_extra,
        disclaimer=row.disclaimer,
    )


def resolve_vat(settings) -> tuple[bool, Decimal]:
    """Shared workspace VAT. Used by every quote and invoice."""
    rate = to_decimal(getattr(settings, "vat_rate", None) or 15)
    if rate < 0:
        rate = Decimal("0")
    if rate > 100:
        rate = Decimal("100")
    return bool(getattr(settings, "vat_enabled", False)), rate


def get_or_create_template(db: Session, profile_id: int, kind: str) -> PracticeTemplate:
    if kind not in _KINDS:
        raise HTTPException(400, "kind must be quote, invoice, or rfq")
    row = (
        db.query(PracticeTemplate)
        .filter(PracticeTemplate.user_profile_id == profile_id, PracticeTemplate.kind == kind)
        .first()
    )
    if row:
        dirty = False
        if not (row.number_prefix or "").strip():
            row.number_prefix = default_prefix(kind)
            dirty = True
        if not row.number_width:
            row.number_width = 3
            dirty = True
        if not row.number_next:
            row.number_next = 1
            dirty = True
        if dirty:
            db.commit()
            db.refresh(row)
        return row
    row = PracticeTemplate(
        user_profile_id=profile_id,
        kind=kind,
        number_prefix=default_prefix(kind),
        number_width=3,
        number_next=1,
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def issuer_from_profile(profile: UserProfile) -> IssuerDetails:
    return IssuerDetails(
        name=profile.business_name or profile.full_name or profile.name,
        trading_name=profile.business_name,
        contact_name=profile.full_name,
        email=profile.email,
        phone=profile.phone,
        address_line1=profile.address_line1,
        address_line2=profile.address_line2,
        city=profile.city,
        postal_code=profile.postal_code,
        country=profile.country or "South Africa",
        tax_number=profile.tax_number,
        vat_number=profile.vat_number,
        business_registration_number=profile.business_registration_number,
    )


def stored_issuer(settings) -> IssuerDetails:
    raw = getattr(settings, "issuer_json", None) or {}
    if not isinstance(raw, dict):
        raw = {}
    return IssuerDetails.model_validate(raw)


def resolve_issuer(db: Session, profile: UserProfile) -> AddressCard:
    settings = get_or_create_settings(db, profile.id)
    if getattr(settings, "use_profile_issuer", False):
        d = issuer_from_profile(profile)
    else:
        d = stored_issuer(settings)
        if not (d.name or "").strip():
            d = issuer_from_profile(profile)
    return AddressCard(
        name=d.name,
        trading_name=d.trading_name,
        contact_name=d.contact_name,
        email=d.email,
        phone=d.phone,
        address_line1=d.address_line1,
        address_line2=d.address_line2,
        city=d.city,
        postal_code=d.postal_code,
        country=d.country,
        tax_number=d.tax_number,
        vat_number=d.vat_number,
        business_registration_number=d.business_registration_number,
        profile_type=profile.profile_type,
    )


def bank_dict(row: PracticeTemplate) -> dict:
    return {
        "bank_name": row.bank_name,
        "bank_account_name": row.bank_account_name,
        "bank_account_number": row.bank_account_number,
        "bank_branch_code": row.bank_branch_code,
        "bank_extra": row.bank_extra,
    }


def resolve_logo_path(db: Session, profile: UserProfile) -> tuple[Path | None, str | None]:
    settings = get_or_create_settings(db, profile.id)
    if settings.logo_path:
        path = Path(settings.logo_path)
        if not path.is_absolute():
            path = DATA_DIR / settings.logo_path
        if path.is_file():
            return path, "practice"
    if getattr(profile, "logo_path", None):
        path = Path(profile.logo_path)
        if not path.is_absolute():
            path = DATA_DIR / profile.logo_path
        if path.is_file():
            return path, "profile"
    return None, None


def _delete_practice_logo(rel: str | None) -> None:
    if not rel:
        return
    path = Path(rel)
    if not path.is_absolute():
        path = DATA_DIR / rel
    try:
        if path.is_file() and "practice_logos" in path.as_posix():
            path.unlink()
    except OSError:
        pass


@router.get("/templates", response_model=BrandingOut)
def get_branding(
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    quote = get_or_create_template(db, profile.id, "quote")
    invoice = get_or_create_template(db, profile.id, "invoice")
    settings = get_or_create_settings(db, profile.id)
    vat_on, vat_rate = resolve_vat(settings)
    _path, source = resolve_logo_path(db, profile)
    return BrandingOut(
        has_logo=_path is not None,
        logo_source=source,
        use_profile_issuer=bool(getattr(settings, "use_profile_issuer", False)),
        issuer=stored_issuer(settings),
        profile_issuer=issuer_from_profile(profile),
        vat_enabled=vat_on,
        vat_rate=vat_rate,
        quotes=_template_out(quote),
        invoices=_template_out(invoice),
    )


@router.patch("/branding/vat", response_model=BrandingOut)
def update_vat(
    body: VatUpdate,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    settings = get_or_create_settings(db, profile.id)
    rate = to_decimal(body.vat_rate if body.vat_rate is not None else (settings.vat_rate or 15))
    if rate < 0 or rate > 100:
        raise HTTPException(400, "VAT rate must be between 0 and 100")
    settings.vat_enabled = bool(body.vat_enabled)
    settings.vat_rate = rate
    settings.updated_at = datetime.utcnow()
    db.commit()
    return get_branding(db, profile)


@router.patch("/branding/issuer", response_model=BrandingOut)
def update_issuer(
    body: IssuerUpdate,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    settings = get_or_create_settings(db, profile.id)
    settings.use_profile_issuer = bool(body.use_profile_data)
    if body.details is not None:
        settings.issuer_json = body.details.model_dump()
    settings.updated_at = datetime.utcnow()
    db.commit()
    return get_branding(db, profile)


@router.get("/templates/{kind}", response_model=TemplateOut)
def get_template(
    kind: str,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _template_out(get_or_create_template(db, profile_id, kind))


@router.patch("/templates/{kind}", response_model=TemplateOut)
def update_template(
    kind: str,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = get_or_create_template(db, profile_id, kind)
    data = body.model_dump(exclude_unset=True)
    data.pop("vat_enabled", None)
    data.pop("vat_rate", None)
    if "number_code" in data:
        prefix, width, nxt = parse_number_code(data.pop("number_code"), kind)
        data["number_prefix"] = prefix
        data["number_width"] = width
        data["number_next"] = nxt
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _template_out(row)


@router.get("/branding/logo")
def get_logo(
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    path, _source = resolve_logo_path(db, profile)
    if not path:
        raise HTTPException(404, "No Practice logo yet")
    media = "image/png"
    suf = path.suffix.lower()
    if suf in (".jpg", ".jpeg"):
        media = "image/jpeg"
    elif suf == ".webp":
        media = "image/webp"
    elif suf == ".gif":
        media = "image/gif"
    return FileResponse(path, media_type=media, filename=path.name)


@router.post("/branding/logo", response_model=BrandingOut)
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    filename = file.filename or "logo.png"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_LOGO:
        raise HTTPException(400, "Logo must be PNG, JPG, WEBP, or GIF")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > _MAX_LOGO:
        raise HTTPException(400, "Logo must be 3 MB or smaller")

    settings = get_or_create_settings(db, profile.id)
    _delete_practice_logo(settings.logo_path)
    ensure_data_dirs()
    rel = f"practice_logos/profile_{profile.id}_{datetime.utcnow().strftime('%H%M%S')}{ext}"
    dest = DATA_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    settings.logo_path = rel
    db.commit()
    return get_branding(db, profile)


@router.delete("/branding/logo", response_model=BrandingOut)
def delete_logo(
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    settings = get_or_create_settings(db, profile.id)
    _delete_practice_logo(settings.logo_path)
    settings.logo_path = None
    db.commit()
    return get_branding(db, profile)
