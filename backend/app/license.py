"""Local trial + offline unlock keys (pre-subscription).

Silent 30-day trial starts on first successful app open (persisted in SQLite
AppSettings). After expiry the install is locked until a valid unlock key is
entered, or the user receives a new build with a fresh data folder / key.

This is a deterrent for casual free use — not DRM. Real subscriptions later
will use online verification.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSettings

TRIAL_DAYS = 30
SETTING_TRIAL_STARTED = "trial_started_at"
SETTING_LICENSE_KEY = "license_key"
SETTING_LICENSE_KIND = "license_kind"
SETTING_LICENSE_ACTIVATED = "license_activated_at"

# Build-time secret — change for paid production builds
_DEFAULT_SECRET = "ledgerflow-tester-unlock-v1-change-me"


def _secret() -> str:
    return (
        os.environ.get("LEDGERFLOW_LICENSE_SECRET", "").strip()
        or _DEFAULT_SECRET
    )


def _get(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else None


def _set(db: Session, key: str, value: str) -> None:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=key, value=value))
    db.commit()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # store UTC without tzinfo
        return datetime.fromisoformat(s.replace("Z", ""))
    except ValueError:
        return None


def ensure_trial_started(db: Session) -> datetime:
    """Stamp first open silently; return trial start datetime."""
    existing = _parse_iso(_get(db, SETTING_TRIAL_STARTED))
    if existing:
        return existing
    now = datetime.utcnow().replace(microsecond=0)
    _set(db, SETTING_TRIAL_STARTED, now.isoformat())
    return now


def expected_lifetime_key() -> str:
    """Deterministic offline lifetime unlock for this product secret."""
    dig = hmac.new(
        _secret().encode("utf-8"),
        b"ledgerflow-lifetime-v1",
        hashlib.sha256,
    ).hexdigest()[:16].upper()
    return f"LF-LIFE-{dig}"


def expected_extend30_key() -> str:
    """One-shot style 30-day extension key (re-activates as licensed lifetime for simplicity).

    For tester builds we treat any valid product key as full unlock so you don't
    need online renewal. Subscriptions will replace this later.
    """
    dig = hmac.new(
        _secret().encode("utf-8"),
        b"ledgerflow-extend30-v1",
        hashlib.sha256,
    ).hexdigest()[:16].upper()
    return f"LF-EXT30-{dig}"


def validate_unlock_key(raw: str) -> Optional[str]:
    """Return license kind if key is valid, else None."""
    key = (raw or "").strip().upper().replace(" ", "")
    if not key:
        return None
    if key == expected_lifetime_key():
        return "lifetime"
    if key == expected_extend30_key():
        return "lifetime"  # full unlock for now
    # Optional: env override for a one-off key without redistributing builds
    env_key = os.environ.get("LEDGERFLOW_LICENSE_KEY", "").strip().upper().replace(" ", "")
    if env_key and key == env_key:
        return "lifetime"
    return None


@dataclass
class LicenseStatus:
    trial_days: int
    trial_started_at: Optional[str]
    days_remaining: int
    expired: bool
    licensed: bool
    license_kind: Optional[str]
    message: str
    can_use_app: bool
    """Always true for option C — user can open and view their local data."""
    read_only: bool
    """True when trial ended and no unlock key: view only, no writes/exports."""


def get_license_status(db: Session) -> LicenseStatus:
    started = ensure_trial_started(db)
    licensed = bool(_get(db, SETTING_LICENSE_KEY))
    kind = _get(db, SETTING_LICENSE_KIND)

    if licensed:
        return LicenseStatus(
            trial_days=TRIAL_DAYS,
            trial_started_at=started.isoformat(),
            days_remaining=-1,  # N/A — licensed
            expired=False,
            licensed=True,
            license_kind=kind or "lifetime",
            message="Licensed — full access on this install.",
            can_use_app=True,
            read_only=False,
        )

    end = started + timedelta(days=TRIAL_DAYS)
    now = datetime.utcnow()
    remaining = (end.date() - now.date()).days
    # Inclusive window: day 0 of trial through day 29 = 30 calendar days of use
    # remaining can be 0 on last day, negative after
    if remaining < 0:
        return LicenseStatus(
            trial_days=TRIAL_DAYS,
            trial_started_at=started.isoformat(),
            days_remaining=0,
            expired=True,
            licensed=False,
            license_kind=None,
            message=(
                "Your 30-day tester access has ended. You can still view your data on this PC, "
                "but editing, uploads, rules, and exports are locked until you enter an unlock key "
                "or get a new licensed build."
            ),
            can_use_app=True,  # Option C: always allow open + view
            read_only=True,
        )

    return LicenseStatus(
        trial_days=TRIAL_DAYS,
        trial_started_at=started.isoformat(),
        days_remaining=remaining,
        expired=False,
        licensed=False,
        license_kind=None,
        message=f"{remaining} day{'s' if remaining != 1 else ''} remaining on tester access.",
        can_use_app=True,
        read_only=False,
    )


def activate_license(db: Session, key: str) -> LicenseStatus:
    kind = validate_unlock_key(key)
    if not kind:
        raise ValueError("Invalid unlock key. Check the code and try again.")
    now = datetime.utcnow().replace(microsecond=0)
    _set(db, SETTING_LICENSE_KEY, key.strip().upper().replace(" ", ""))
    _set(db, SETTING_LICENSE_KIND, kind)
    _set(db, SETTING_LICENSE_ACTIVATED, now.isoformat())
    # Ensure trial stamp exists for audit
    ensure_trial_started(db)
    return get_license_status(db)


def print_dev_keys() -> None:
    """CLI helper: python -c \"from app.license import print_dev_keys; print_dev_keys()\""""
    print("Lifetime unlock keys (this secret):")
    print(" ", expected_lifetime_key())
    print(" ", expected_extend30_key())
