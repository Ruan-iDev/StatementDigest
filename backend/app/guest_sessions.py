"""Ephemeral in-memory guest sessions — no account, no durable auth rows."""

from __future__ import annotations

import secrets
import threading
from datetime import datetime, timedelta
from typing import Optional

_lock = threading.Lock()
# raw token -> expiry (UTC)
_sessions: dict[str, datetime] = {}

GUEST_HOURS = 12
GUEST_USERNAME = "Guest"


def issue_guest_token(hours: int = GUEST_HOURS) -> str:
    token = secrets.token_urlsafe(32)
    with _lock:
        _sessions[token] = datetime.utcnow() + timedelta(hours=hours)
    return token


def is_guest_token(token: Optional[str]) -> bool:
    if not token:
        return False
    with _lock:
        exp = _sessions.get(token)
        if not exp:
            return False
        if exp <= datetime.utcnow():
            del _sessions[token]
            return False
        return True


def revoke_guest_token(token: Optional[str]) -> None:
    if not token:
        return
    with _lock:
        _sessions.pop(token, None)


def purge_expired() -> None:
    now = datetime.utcnow()
    with _lock:
        dead = [t for t, exp in _sessions.items() if exp <= now]
        for t in dead:
            del _sessions[t]
