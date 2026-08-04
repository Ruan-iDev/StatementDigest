"""Trial + unlock key endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.license import activate_license, get_license_status

router = APIRouter(prefix="/license", tags=["license"])


class LicenseStatusOut(BaseModel):
    trial_days: int
    trial_started_at: str | None = None
    days_remaining: int
    expired: bool
    licensed: bool
    license_kind: str | None = None
    message: str
    can_use_app: bool
    read_only: bool = False


class ActivateIn(BaseModel):
    key: str = Field(..., min_length=4, max_length=200)


def _out(s) -> LicenseStatusOut:
    return LicenseStatusOut(
        trial_days=s.trial_days,
        trial_started_at=s.trial_started_at,
        days_remaining=s.days_remaining,
        expired=s.expired,
        licensed=s.licensed,
        license_kind=s.license_kind,
        message=s.message,
        can_use_app=s.can_use_app,
        read_only=s.read_only,
    )


@router.get("/status", response_model=LicenseStatusOut)
def license_status(db: Session = Depends(get_db)):
    """Public: stamps trial on first call; returns days remaining / licensed / read-only."""
    return _out(get_license_status(db))


@router.post("/activate", response_model=LicenseStatusOut)
def license_activate(payload: ActivateIn, db: Session = Depends(get_db)):
    try:
        s = activate_license(db, payload.key)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return _out(s)
