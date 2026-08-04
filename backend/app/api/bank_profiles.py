from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile_id
from app.models import BankProfile, ImportBatch, Transaction
from app.schemas import (
    BankProfileCreate,
    BankProfileOut,
    BankProfileUpdate,
    CalibrationPreviewResponse,
    DissectResponse,
)
from app.services.parsers.base import (
    get_preset,
    is_supported_bank_type,
    list_supported_banks,
    preview_file,
)
from app.services.parsers.detect import dissect_statement

router = APIRouter(prefix="/bank-profiles", tags=["bank-profiles"])


@router.get("", response_model=list[BankProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    return (
        db.query(BankProfile)
        .filter(BankProfile.user_profile_id == user_profile_id)
        .order_by(BankProfile.name.asc())
        .all()
    )


@router.get("/supported-banks")
def supported_banks():
    """Banks LedgerFlow has calibrated — used by the guided profile picker.

    Users never calibrate statements themselves; they only pick from this list.
    """
    return {"banks": list_supported_banks()}


@router.get("/presets/{bank_type}")
def get_bank_preset(bank_type: str):
    """Return default calibration for a supported bank type."""
    if not is_supported_bank_type(bank_type) and bank_type.lower() not in {
        "fnb",
        "discovery",
        "capitec",
        "nedbank",
        "other",
    }:
        # Still allow known preset keys used by older clients
        pass
    return get_preset(bank_type)


@router.post("/dissect", response_model=DissectResponse)
async def dissect_sample(file: UploadFile = File(...)):
    """Dissect a sample statement for the first-run bank profile wizard.

    Auto-detects columns, bank family, amount style, and returns a friendly
    preview — no technical script for the user.
    """
    filename = file.filename or "sample.csv"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in {"csv", "pdf", "txt", "tsv"}:
        raise HTTPException(400, "Please upload a CSV or PDF statement")

    content = await file.read()
    if not content:
        raise HTTPException(400, "File is empty")

    try:
        result = dissect_statement(content, filename)
    except Exception as exc:
        raise HTTPException(400, f"Could not read this statement: {exc}") from exc

    return DissectResponse(**result)


@router.post("/preview", response_model=CalibrationPreviewResponse)
async def preview_calibration(
    file: UploadFile = File(...),
    bank_type: str = Form("Other"),
    calibration_json: str = Form("{}"),
):
    """Upload a sample statement and preview parsing with proposed calibration."""
    import json

    content = await file.read()
    try:
        cal = json.loads(calibration_json) if calibration_json else {}
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"Invalid calibration JSON: {exc}") from exc

    if not cal:
        cal = get_preset(bank_type)
    else:
        cal = {**get_preset(bank_type), **cal}

    result = preview_file(content, file.filename or "sample.csv", cal)
    return CalibrationPreviewResponse(**result)


@router.post("", response_model=BankProfileOut, status_code=201)
def create_profile(
    payload: BankProfileCreate,
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    # Always start from our calibrated preset; never trust empty DIY recipes
    bank_type = (payload.bank_type or "").strip() or "Other"
    if not is_supported_bank_type(bank_type):
        raise HTTPException(
            400,
            "That bank is not available yet. Choose one of the supported banks from the list.",
        )
    base = get_preset(bank_type)
    cal = {**base, **(payload.calibration_data or {})}
    # Routing flags from our preset always win
    for key in (
        "fnb_preset",
        "discovery_preset",
        "capitec_preset",
        "nedbank_preset",
        "bank_family",
        "parser",
        "capitec_business",
    ):
        if key in base:
            cal[key] = base[key]
    profile = BankProfile(
        user_profile_id=user_profile_id,
        name=(payload.name or "").strip() or bank_type,
        bank_type=bank_type,
        calibration_data=cal,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=BankProfileOut)
def get_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    profile = db.get(BankProfile, profile_id)
    if not profile or profile.user_profile_id != user_profile_id:
        raise HTTPException(404, "Bank profile not found")
    return profile


@router.patch("/{profile_id}", response_model=BankProfileOut)
def update_profile(
    profile_id: int,
    payload: BankProfileUpdate,
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    """Update name, bank type, and/or calibration (e.g. re-learn layout from a new sample)."""
    from datetime import datetime

    profile = db.get(BankProfile, profile_id)
    if not profile or profile.user_profile_id != user_profile_id:
        raise HTTPException(404, "Bank profile not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(profile, k, v)
    # Explicit touch so SQLite always refreshes updated_at when re-calibrating
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
def delete_profile(
    profile_id: int,
    force: bool = Query(
        True,
        description="When true (default), also remove imports and transactions for this profile.",
    ),
    db: Session = Depends(get_db),
    user_profile_id: int = Depends(get_active_profile_id),
):
    """Delete a bank profile within the active user workspace."""
    profile = db.get(BankProfile, profile_id)
    if not profile or profile.user_profile_id != user_profile_id:
        return None

    tx_count = (
        db.query(Transaction).filter(Transaction.bank_profile_id == profile_id).count()
    )
    batch_count = (
        db.query(ImportBatch).filter(ImportBatch.bank_profile_id == profile_id).count()
    )

    if (tx_count or batch_count) and not force:
        raise HTTPException(
            409,
            (
                f"This bank profile has {batch_count} import(s) and {tx_count} transaction(s). "
                "Delete with force=true to remove related data."
            ),
        )

    try:
        db.query(Transaction).filter(Transaction.bank_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(ImportBatch).filter(ImportBatch.bank_profile_id == profile_id).delete(
            synchronize_session=False
        )
        db.query(BankProfile).filter(
            BankProfile.id == profile_id,
            BankProfile.user_profile_id == user_profile_id,
        ).delete(synchronize_session=False)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, f"Could not delete bank profile: {exc}") from exc

    return None
