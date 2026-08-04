"""Password hashing and session tokens — never store plain-text passwords."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

# scrypt parameters (stdlib — no extra dependency)
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32

SESSION_DAYS = 30


def hash_password(password: str) -> str:
    """Return scrypt$salt$hex digest string. No policy limits — any non-empty password."""
    if password is None or password == "":
        raise ValueError("Password cannot be empty")
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(
        password.encode("utf-8"),
        salt=bytes.fromhex(salt),
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
    )
    return f"scrypt${salt}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt, digest = stored.split("$", 2)
        if algo != "scrypt":
            return False
        key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt),
            n=_SCRYPT_N,
            r=_SCRYPT_R,
            p=_SCRYPT_P,
            dklen=_SCRYPT_DKLEN,
        )
        return hmac.compare_digest(key.hex(), digest)
    except Exception:
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_expiry(days: int = SESSION_DAYS) -> datetime:
    return datetime.utcnow() + timedelta(days=days)


# Unambiguous alphabet (no 0/O, 1/l/I) for 15-char suggestions
PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*"


def generate_password(length: int = 15) -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(length))
