"""User profile (workspace) management — fully isolated data per profile."""

from __future__ import annotations

import copy
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.attestation import ensure_profile_attestation
from app.config import DATA_DIR, ensure_data_dirs
from app.database import get_db
from app.deps import get_active_profile_id, set_active_profile_id
from app.models import (
    BankProfile,
    DisclaimerAcceptance,
    ImportBatch,
    Ledger,
    Rule,
    TrainingPattern,
    TrainingReason,
    Transaction,
    UserProfile,
)
from app.schemas import (
    UserProfileCreate,
    UserProfileOut,
    UserProfileSwitch,
    UserProfileUpdate,
    WorkspaceLoginReset,
)
from app.security import hash_password, verify_password
from app.seed import seed_ledgers_for_profile

router = APIRouter(prefix="/profiles", tags=["profiles"])

_ALLOWED_LOGO_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_MAX_LOGO_BYTES = 3 * 1024 * 1024  # 3 MB


def _normalize_profile_type(value: str | None) -> str:
    v = (value or "individual").strip().lower()
    if v not in ("individual", "business"):
        raise HTTPException(400, "profile_type must be 'individual' or 'business'")
    return v


def _delete_logo_file(logo_path: str | None) -> None:
    if not logo_path:
        return
    p = Path(logo_path)
    if not p.is_absolute():
        p = DATA_DIR / logo_path
    try:
        if p.is_file():
            p.unlink()
    except OSError:
        pass


def _out(p: UserProfile, db: Session, active_id: int) -> UserProfileOut:
    p = ensure_profile_attestation(db, p)
    has_logo = False
    if getattr(p, "logo_path", None):
        lp = Path(p.logo_path)
        if not lp.is_absolute():
            lp = DATA_DIR / p.logo_path
        has_logo = lp.is_file()
    return UserProfileOut(
        id=p.id,
        name=p.name,
        profile_type=getattr(p, "profile_type", None) or "individual",
        public_id=p.public_id,
        full_name=p.full_name,
        business_name=getattr(p, "business_name", None),
        email=p.email,
        phone=p.phone,
        address_line1=p.address_line1,
        address_line2=p.address_line2,
        city=p.city,
        postal_code=p.postal_code,
        country=p.country,
        tax_number=p.tax_number,
        business_registration_number=getattr(p, "business_registration_number", None),
        vat_number=getattr(p, "vat_number", None),
        notes=p.notes,
        has_logo=has_logo,
        fy_start_month=p.fy_start_month or 3,
        currency=p.currency or "ZAR",
        created_at=p.created_at,
        updated_at=p.updated_at,
        is_active=p.id == active_id,
        has_password=bool(getattr(p, "password_hash", None)),
        workspace_username=getattr(p, "workspace_username", None),
        ledger_count=db.query(Ledger).filter(Ledger.user_profile_id == p.id).count(),
        bank_profile_count=db.query(BankProfile)
        .filter(BankProfile.user_profile_id == p.id)
        .count(),
        transaction_count=db.query(Transaction)
        .filter(Transaction.user_profile_id == p.id)
        .count(),
    )


@router.get("", response_model=list[UserProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    rows = db.query(UserProfile).order_by(UserProfile.name.asc(), UserProfile.id.asc()).all()
    return [_out(p, db, active_id) for p in rows]


@router.get("/active", response_model=UserProfileOut)
def get_active(
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    p = db.get(UserProfile, active_id)
    if not p:
        raise HTTPException(404, "Active profile not found")
    return _out(p, db, active_id)


@router.post("/switch", response_model=UserProfileOut)
def switch_profile(
    payload: UserProfileSwitch,
    db: Session = Depends(get_db),
):
    """Switch workspace. Extra client profiles require workspace username + password."""
    p = db.get(UserProfile, payload.profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    ph = getattr(p, "password_hash", None)
    if ph:
        expected_user = (getattr(p, "workspace_username", None) or "").strip()
        given_user = (payload.workspace_username or "").strip()
        if expected_user:
            if not given_user or given_user.casefold() != expected_user.casefold():
                raise HTTPException(403, "Incorrect workspace username or password.")
        if not payload.password or not verify_password(payload.password, ph):
            raise HTTPException(403, "Incorrect workspace username or password.")
    set_active_profile_id(db, payload.profile_id)
    return _out(p, db, payload.profile_id)


@router.post("", response_model=UserProfileOut, status_code=201)
def create_profile(
    payload: UserProfileCreate,
    db: Session = Depends(get_db),
):
    """Create a clean-slate profile; optionally copy ledgers and/or bank profiles.

    First profile (registration) needs no workspace credentials — app login protects it.
    Extra profiles on My Profile should send workspace_username + password together.

    Intentionally does NOT depend on get_active_profile_id: day-zero registration
    must work even when the DB was wiped and the client still sends a stale
    X-Profile-Id (or there is no active profile yet).
    """
    name = (payload.name or "").strip() or "New Profile"
    ptype = _normalize_profile_type(payload.profile_type)
    ws_user = (payload.workspace_username or "").strip() or None
    pw_hash = None
    if payload.password or ws_user:
        if not ws_user:
            raise HTTPException(400, "Workspace username is required for a locked profile")
        if not payload.password:
            raise HTTPException(400, "Workspace password is required for a locked profile")
        if len(ws_user) < 2:
            raise HTTPException(400, "Workspace username must be at least 2 characters")
        try:
            pw_hash = hash_password(payload.password)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    profile = UserProfile(
        name=name,
        profile_type=ptype,
        full_name=payload.full_name,
        business_name=payload.business_name if ptype == "business" else None,
        business_registration_number=(
            payload.business_registration_number if ptype == "business" else None
        ),
        vat_number=payload.vat_number if ptype == "business" else None,
        email=payload.email,
        phone=payload.phone,
        workspace_username=ws_user,
        password_hash=pw_hash,
        country="South Africa",
        fy_start_month=3,
        currency="ZAR",
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    ensure_profile_attestation(db, profile)

    # Copy ledgers from chosen source
    if payload.copy_ledgers_from_id:
        src = db.get(UserProfile, payload.copy_ledgers_from_id)
        if not src:
            raise HTTPException(400, "Source profile for ledgers not found")
        src_ledgers = (
            db.query(Ledger)
            .filter(Ledger.user_profile_id == src.id, Ledger.is_archived.is_(False))
            .order_by(Ledger.sort_order.asc(), Ledger.id.asc())
            .all()
        )
        id_map: dict[int, int] = {}
        for lg in src_ledgers:
            new_lg = Ledger(
                user_profile_id=profile.id,
                name=lg.name,
                type=lg.type,
                parent_id=None,
                is_system=lg.is_system,
                is_archived=False,
                budget_monthly=lg.budget_monthly,
                budget_annual=lg.budget_annual,
                sort_order=lg.sort_order,
            )
            db.add(new_lg)
            db.flush()
            id_map[lg.id] = new_lg.id
        for lg in src_ledgers:
            if lg.parent_id and lg.parent_id in id_map:
                new_lg = db.get(Ledger, id_map[lg.id])
                if new_lg:
                    new_lg.parent_id = id_map[lg.parent_id]
        db.commit()
    elif payload.seed_default_ledgers:
        seed_ledgers_for_profile(db, profile.id)

    if payload.copy_bank_profiles_from_id:
        src = db.get(UserProfile, payload.copy_bank_profiles_from_id)
        if not src:
            raise HTTPException(400, "Source profile for bank profiles not found")
        for bp in db.query(BankProfile).filter(BankProfile.user_profile_id == src.id).all():
            db.add(
                BankProfile(
                    user_profile_id=profile.id,
                    name=bp.name,
                    bank_type=bp.bank_type,
                    calibration_data=copy.deepcopy(bp.calibration_data or {}),
                )
            )
        db.commit()

    set_active_profile_id(db, profile.id)
    db.refresh(profile)
    return _out(profile, db, profile.id)


@router.post("/{profile_id}/workspace-login", response_model=UserProfileOut)
def reset_workspace_login(
    profile_id: int,
    payload: WorkspaceLoginReset,
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    """Reset extra-profile unlock details. Requires app login, not the old workspace password."""
    p = db.get(UserProfile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    user = (payload.workspace_username or "").strip()
    if len(user) < 2:
        raise HTTPException(400, "Workspace username must be at least 2 characters")
    if not payload.password:
        raise HTTPException(400, "Workspace password is required")
    try:
        p.workspace_username = user
        p.password_hash = hash_password(payload.password)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    db.commit()
    db.refresh(p)
    return _out(p, db, active_id)


@router.get("/{profile_id}/logo")
def get_logo(
    profile_id: int,
    db: Session = Depends(get_db),
):
    """Serve the business logo image for this profile (auth required via middleware)."""
    p = db.get(UserProfile, profile_id)
    if not p or not p.logo_path:
        raise HTTPException(404, "Logo not found")
    path = Path(p.logo_path)
    if not path.is_absolute():
        path = DATA_DIR / p.logo_path
    if not path.is_file():
        raise HTTPException(404, "Logo file missing")
    media = "image/png"
    suf = path.suffix.lower()
    if suf in (".jpg", ".jpeg"):
        media = "image/jpeg"
    elif suf == ".webp":
        media = "image/webp"
    elif suf == ".gif":
        media = "image/gif"
    return FileResponse(path, media_type=media, filename=path.name)


@router.post("/{profile_id}/logo", response_model=UserProfileOut)
async def upload_logo(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    """Upload / replace business logo (PNG, JPG, WEBP, GIF — max 3MB)."""
    p = db.get(UserProfile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    if (getattr(p, "profile_type", None) or "individual") != "business":
        raise HTTPException(400, "Only business profiles can have a logo")

    filename = file.filename or "logo.png"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_LOGO_EXT:
        raise HTTPException(400, "Logo must be PNG, JPG, WEBP, or GIF")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > _MAX_LOGO_BYTES:
        raise HTTPException(400, "Logo must be 3 MB or smaller")

    ensure_data_dirs()
    # Remove previous file
    _delete_logo_file(p.logo_path)

    rel = f"logos/profile_{profile_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest = DATA_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    p.logo_path = rel
    db.commit()
    db.refresh(p)
    return _out(p, db, active_id)


@router.delete("/{profile_id}/logo", response_model=UserProfileOut)
def delete_logo(
    profile_id: int,
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    p = db.get(UserProfile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    _delete_logo_file(p.logo_path)
    p.logo_path = None
    db.commit()
    db.refresh(p)
    return _out(p, db, active_id)


@router.get("/{profile_id}", response_model=UserProfileOut)
def get_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    p = db.get(UserProfile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    return _out(p, db, active_id)


@router.patch("/{profile_id}", response_model=UserProfileOut)
def update_profile(
    profile_id: int,
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    p = db.get(UserProfile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    data = payload.model_dump(exclude_unset=True)
    if "profile_type" in data:
        data["profile_type"] = _normalize_profile_type(data["profile_type"])
        # Switching away from business: keep logo file but it won't print; user can delete
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _out(p, db, active_id)


@router.delete("/{profile_id}", status_code=204)
def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    active_id: int = Depends(get_active_profile_id),
):
    """Delete a profile and all its data. Cannot delete the last remaining profile."""
    total = db.query(UserProfile).count()
    if total <= 1:
        raise HTTPException(400, "Cannot delete the only profile")
    p = db.get(UserProfile, profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")

    _delete_logo_file(getattr(p, "logo_path", None))

    try:
        # Order matters: clear dependents before the user_profiles row (FK ON).
        db.query(Transaction).filter(Transaction.user_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(ImportBatch).filter(ImportBatch.user_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(Rule).filter(Rule.user_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(BankProfile).filter(BankProfile.user_profile_id == profile_id).delete(
            synchronize_session=False
        )
        # Break ledger parent self-FK before bulk delete
        db.query(Ledger).filter(Ledger.user_profile_id == profile_id).update(
            {Ledger.parent_id: None}, synchronize_session=False
        )
        db.query(Ledger).filter(Ledger.user_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(TrainingPattern).filter(
            TrainingPattern.user_profile_id == profile_id
        ).delete(synchronize_session=False)
        db.query(TrainingReason).filter(TrainingReason.user_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(DisclaimerAcceptance).filter(
            DisclaimerAcceptance.user_profile_id == profile_id
        ).delete(synchronize_session=False)

        db.delete(p)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, f"Could not delete profile: {exc}") from exc

    if active_id == profile_id:
        other = db.query(UserProfile).order_by(UserProfile.id.asc()).first()
        if other:
            set_active_profile_id(db, other.id)
    return None
