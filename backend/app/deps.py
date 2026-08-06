"""Shared FastAPI dependencies — active user profile isolation."""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSettings, UserProfile


ACTIVE_KEY = "active_user_profile_id"


def _get_setting(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else None


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=key, value=value))
    db.commit()


def get_active_profile_id(
    db: Session = Depends(get_db),
    x_profile_id: Optional[str] = Header(None, alias="X-Profile-Id"),
) -> int:
    """Resolve active workspace: header wins, else stored setting, else first profile.

    Stale client headers are common after wiping Documents/LedgerFlow while the UI
    still has an old localStorage profile id — fall through instead of 404 so
    registration and post-login APIs can recover.
    """
    if x_profile_id:
        try:
            pid = int(x_profile_id)
        except ValueError as exc:
            raise HTTPException(400, "Invalid X-Profile-Id") from exc
        if db.get(UserProfile, pid):
            return pid
        # Header points at a deleted/wiped profile — ignore and resolve normally

    stored = _get_setting(db, ACTIVE_KEY)
    if stored:
        try:
            pid = int(stored)
            if db.get(UserProfile, pid):
                return pid
        except ValueError:
            pass

    first = db.query(UserProfile).order_by(UserProfile.id.asc()).first()
    if not first:
        raise HTTPException(500, "No user profiles configured")
    _set_setting(db, ACTIVE_KEY, str(first.id))
    return first.id


def get_active_profile(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
) -> UserProfile:
    prof = db.get(UserProfile, profile_id)
    if not prof:
        raise HTTPException(404, "User profile not found")
    return prof


def set_active_profile_id(db: Session, profile_id: int) -> None:
    if not db.get(UserProfile, profile_id):
        raise HTTPException(404, "User profile not found")
    _set_setting(db, ACTIVE_KEY, str(profile_id))
