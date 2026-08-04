"""Profile attestation IDs — correlators for disclaimer audit, not government identity.

public_id: visible unique code for a user profile (e.g. LF-A1B2C3D4-E5F67890)
seal: HMAC of public_id with install secret — detects casual tampering if both
      profile and acceptance rows still match.

Does NOT prove “this is human X” to the outside world when everything lives on
one device. It proves “this local profile accepted disclaimer version V at time T.”
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSettings, UserProfile

INSTALL_SECRET_KEY = "install_attestation_secret"


def _get_or_create_install_secret(db: Session) -> str:
    row = db.query(AppSettings).filter(AppSettings.key == INSTALL_SECRET_KEY).first()
    if row and row.value:
        return row.value
    secret = secrets.token_hex(32)
    if row:
        row.value = secret
    else:
        db.add(AppSettings(key=INSTALL_SECRET_KEY, value=secret))
    db.commit()
    return secret


def format_public_id(raw_uuid: Optional[str] = None) -> str:
    """Human-visible unique id — looks ‘secure’, easy to copy."""
    u = (raw_uuid or str(uuid.uuid4())).replace("-", "").upper()
    # LF-XXXXXXXX-XXXXXXXX (16 hex chars from UUID)
    body = u[:16]
    return f"LF-{body[:8]}-{body[8:16]}"


def seal_public_id(db: Session, public_id: str) -> str:
    secret = _get_or_create_install_secret(db)
    digest = hmac.new(
        secret.encode("utf-8"),
        public_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest


def verify_seal(db: Session, public_id: str, seal: str | None) -> bool:
    if not public_id or not seal:
        return False
    expected = seal_public_id(db, public_id)
    return hmac.compare_digest(expected, seal)


def ensure_profile_attestation(db: Session, profile: UserProfile) -> UserProfile:
    """Ensure profile has public_id + seal; create if missing."""
    changed = False
    if not getattr(profile, "public_id", None):
        profile.public_id = format_public_id()
        changed = True
    # Always re-seal if missing or if public_id set without seal
    if not getattr(profile, "attestation_seal", None) or changed:
        profile.attestation_seal = seal_public_id(db, profile.public_id)
        changed = True
    if changed:
        db.commit()
        db.refresh(profile)
    return profile
