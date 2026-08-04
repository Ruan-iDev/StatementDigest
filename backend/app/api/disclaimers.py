"""Disclaimer acceptance audit API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.attestation import ensure_profile_attestation
from app.database import get_db
from app.deps import get_active_profile_id
from app.disclaimer import DISCLAIMER_BODY, DISCLAIMER_SHORT, DISCLAIMER_TITLE, DISCLAIMER_VERSION
from app.models import DisclaimerAcceptance, UserProfile

router = APIRouter(prefix="/disclaimers", tags=["disclaimers"])


class DisclaimerContentOut(BaseModel):
    version: str
    title: str
    body: str
    short: str
    context: str = "statement_upload"
    profile_public_id: Optional[str] = None


class DisclaimerAcceptIn(BaseModel):
    disclaimer_version: str
    context: str = "statement_upload"
    file_count: int = Field(0, ge=0)
    user_agent: Optional[str] = None


class DisclaimerAcceptOut(BaseModel):
    id: int
    disclaimer_version: str
    accepted_at: datetime
    file_count: int
    profile_public_id: Optional[str] = None
    message: str


class DisclaimerStatusOut(BaseModel):
    version: str
    has_accepted_current: bool
    last_accepted_at: Optional[datetime] = None
    acceptance_count: int = 0
    profile_public_id: Optional[str] = None


@router.get("/upload", response_model=DisclaimerContentOut)
def get_upload_disclaimer(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    profile = db.get(UserProfile, profile_id)
    public_id = None
    if profile:
        ensure_profile_attestation(db, profile)
        public_id = profile.public_id
    return DisclaimerContentOut(
        version=DISCLAIMER_VERSION,
        title=DISCLAIMER_TITLE,
        body=DISCLAIMER_BODY,
        short=DISCLAIMER_SHORT,
        context="statement_upload",
        profile_public_id=public_id,
    )


@router.get("/upload/status", response_model=DisclaimerStatusOut)
def upload_disclaimer_status(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    profile = db.get(UserProfile, profile_id)
    public_id = None
    if profile:
        ensure_profile_attestation(db, profile)
        public_id = profile.public_id
    rows = (
        db.query(DisclaimerAcceptance)
        .filter(
            DisclaimerAcceptance.user_profile_id == profile_id,
            DisclaimerAcceptance.context == "statement_upload",
            DisclaimerAcceptance.action == "accept",
        )
        .order_by(DisclaimerAcceptance.accepted_at.desc())
        .all()
    )
    current = [r for r in rows if r.disclaimer_version == DISCLAIMER_VERSION]
    last = rows[0] if rows else None
    return DisclaimerStatusOut(
        version=DISCLAIMER_VERSION,
        has_accepted_current=len(current) > 0,
        last_accepted_at=last.accepted_at if last else None,
        acceptance_count=len(rows),
        profile_public_id=public_id,
    )


@router.post("/upload/accept", response_model=DisclaimerAcceptOut)
def accept_upload_disclaimer(
    payload: DisclaimerAcceptIn,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
):
    if payload.disclaimer_version != DISCLAIMER_VERSION:
        raise HTTPException(
            400,
            f"Disclaimer version mismatch. Expected {DISCLAIMER_VERSION}. Refresh and try again.",
        )
    profile = db.get(UserProfile, profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    ensure_profile_attestation(db, profile)

    row = DisclaimerAcceptance(
        user_profile_id=profile_id,
        profile_public_id=profile.public_id,
        profile_attestation_seal=profile.attestation_seal,
        disclaimer_version=payload.disclaimer_version,
        action="accept",
        context=payload.context or "statement_upload",
        file_count=payload.file_count or 0,
        user_agent=(payload.user_agent or user_agent or "")[:2000] or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return DisclaimerAcceptOut(
        id=row.id,
        disclaimer_version=row.disclaimer_version,
        accepted_at=row.accepted_at,
        file_count=row.file_count,
        profile_public_id=row.profile_public_id,
        message="Disclaimer acceptance recorded for this profile attestation ID.",
    )


def require_recent_upload_acceptance(
    db: Session,
    profile_id: int,
    *,
    max_age_hours: int = 12,
) -> None:
    """Optional server-side gate for imports (same session / day)."""
    from datetime import timedelta

    cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
    row = (
        db.query(DisclaimerAcceptance)
        .filter(
            DisclaimerAcceptance.user_profile_id == profile_id,
            DisclaimerAcceptance.disclaimer_version == DISCLAIMER_VERSION,
            DisclaimerAcceptance.action == "accept",
            DisclaimerAcceptance.context == "statement_upload",
            DisclaimerAcceptance.accepted_at >= cutoff,
        )
        .order_by(DisclaimerAcceptance.accepted_at.desc())
        .first()
    )
    if not row:
        raise HTTPException(
            403,
            "Please accept the upload disclaimer before processing statements.",
        )
