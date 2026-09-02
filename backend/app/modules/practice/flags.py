"""Per-workspace Practice feature switches. Independent — none requires another."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.modules.practice.models import PracticeSettings

FeatureName = str

_FEATURE_ATTR = {
    "quotes": "quotes_enabled",
    "invoices": "invoices_enabled",
    "projects": "projects_enabled",
}


def get_or_create_settings(db: Session, profile_id: int) -> PracticeSettings:
    row = (
        db.query(PracticeSettings)
        .filter(PracticeSettings.user_profile_id == profile_id)
        .first()
    )
    if row:
        return row
    row = PracticeSettings(
        user_profile_id=profile_id,
        quotes_enabled=True,
        invoices_enabled=True,
        projects_enabled=True,
        vat_enabled=False,
        vat_rate=Decimal("15"),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def is_enabled(db: Session, profile_id: int, feature: FeatureName) -> bool:
    attr = _FEATURE_ATTR.get(feature)
    if not attr:
        return False
    return bool(getattr(get_or_create_settings(db, profile_id), attr))


def require_feature(db: Session, profile_id: int, feature: FeatureName) -> None:
    if is_enabled(db, profile_id, feature):
        return
    label = feature.capitalize()
    raise HTTPException(
        403,
        f"{label} is switched off for this workspace. Turn it on in Settings → Modules.",
    )
