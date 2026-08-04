"""Native app authentication — register once, login, guest, change password (requires current)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.guest_sessions import (
    GUEST_USERNAME,
    is_guest_token,
    issue_guest_token,
    revoke_guest_token,
)
from app.models import AppUser, AuthSession
from app.security import (
    generate_password,
    hash_password,
    hash_token,
    new_session_token,
    session_expiry,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthStatusOut(BaseModel):
    has_users: bool
    authenticated: bool
    username: Optional[str] = None
    user_id: Optional[int] = None
    is_guest: bool = False


class RegisterIn(BaseModel):
    username: str = Field(..., min_length=2, max_length=120)
    password: str = Field(..., min_length=1, max_length=1024)


class LoginIn(BaseModel):
    username: str
    password: str


class AuthTokenOut(BaseModel):
    token: str
    username: str
    user_id: int
    message: str
    is_guest: bool = False


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=1, max_length=1024)


class PasswordSuggestOut(BaseModel):
    password: str
    length: int
    note: str


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def get_optional_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
) -> Optional[AppUser]:
    token = _bearer_token(authorization)
    if not token or is_guest_token(token):
        return None
    th = hash_token(token)
    sess = (
        db.query(AuthSession)
        .filter(
            AuthSession.token_hash == th,
            AuthSession.revoked.is_(False),
            AuthSession.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not sess:
        return None
    return db.get(AppUser, sess.user_id)


def get_current_user(user: Optional[AppUser] = Depends(get_optional_user)) -> AppUser:
    if not user:
        raise HTTPException(401, "Not authenticated. Please log in.")
    return user


def _create_session(db: Session, user: AppUser, user_agent: Optional[str]) -> str:
    raw = new_session_token()
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=session_expiry(),
            revoked=False,
            user_agent=(user_agent or "")[:2000] or None,
        )
    )
    db.commit()
    return raw


@router.get("/status", response_model=AuthStatusOut)
def auth_status(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
    user: Optional[AppUser] = Depends(get_optional_user),
):
    has_users = db.query(AppUser).count() > 0
    token = _bearer_token(authorization)
    if is_guest_token(token):
        return AuthStatusOut(
            has_users=has_users,
            authenticated=True,
            username=GUEST_USERNAME,
            user_id=None,
            is_guest=True,
        )
    return AuthStatusOut(
        has_users=has_users,
        authenticated=user is not None,
        username=user.username if user else None,
        user_id=user.id if user else None,
        is_guest=False,
    )


@router.get("/suggest-password", response_model=PasswordSuggestOut)
def suggest_password():
    """Generate a strong 15-character password suggestion (refresh for a new one)."""
    pw = generate_password(15)
    return PasswordSuggestOut(
        password=pw,
        length=len(pw),
        note=(
            "Copy and store this password somewhere safe before you continue. "
            "If you forget it, this local account cannot be recovered — only reset with the current password."
        ),
    )


@router.post("/register", response_model=AuthTokenOut)
def register(
    payload: RegisterIn,
    db: Session = Depends(get_db),
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
):
    """Create the first (or additional) local account. Password is hashed, never stored plain."""
    username = (payload.username or "").strip()
    if len(username) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if db.query(AppUser).filter(AppUser.username == username).first():
        raise HTTPException(400, "That username is already taken")
    try:
        ph = hash_password(payload.password)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    user = AppUser(username=username, password_hash=ph)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = _create_session(db, user, user_agent)
    return AuthTokenOut(
        token=token,
        username=user.username,
        user_id=user.id,
        message=(
            "Account created. Keep your password backed up — there is no forgot-password recovery."
        ),
        is_guest=False,
    )


@router.post("/login", response_model=AuthTokenOut)
def login(
    payload: LoginIn,
    db: Session = Depends(get_db),
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
):
    username = (payload.username or "").strip()
    user = db.query(AppUser).filter(AppUser.username == username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid username or password")
    token = _create_session(db, user, user_agent)
    return AuthTokenOut(
        token=token,
        username=user.username,
        user_id=user.id,
        message="Logged in.",
        is_guest=False,
    )


@router.post("/guest", response_model=AuthTokenOut)
def guest_login():
    """Enter without an account. Nothing is saved — write APIs are blocked."""
    token = issue_guest_token()
    return AuthTokenOut(
        token=token,
        username=GUEST_USERNAME,
        user_id=0,
        message=(
            "Browsing as Guest. Nothing you do here is saved. "
            "Create an account when you want to keep your data."
        ),
        is_guest=True,
    )


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
):
    token = _bearer_token(authorization)
    if not token:
        return {"message": "Logged out."}
    if is_guest_token(token):
        revoke_guest_token(token)
        return {"message": "Guest session ended. Nothing was saved."}
    th = hash_token(token)
    sess = db.query(AuthSession).filter(AuthSession.token_hash == th).first()
    if sess:
        sess.revoked = True
        db.commit()
    return {"message": "Logged out."}


@router.get("/me")
def me(
    authorization: Optional[str] = Header(None),
    user: Optional[AppUser] = Depends(get_optional_user),
):
    token = _bearer_token(authorization)
    if is_guest_token(token):
        return {
            "user_id": 0,
            "username": GUEST_USERNAME,
            "created_at": None,
            "is_guest": True,
        }
    if not user:
        raise HTTPException(401, "Not authenticated. Please log in.")
    return {
        "user_id": user.id,
        "username": user.username,
        "created_at": user.created_at,
        "is_guest": False,
    }


@router.post("/change-password")
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None),
    user: Optional[AppUser] = Depends(get_optional_user),
):
    """Reset password only if the current password is correct — no email recovery."""
    token = _bearer_token(authorization)
    if is_guest_token(token):
        raise HTTPException(403, "Guests cannot set a password. Create an account first.")
    if not user:
        raise HTTPException(401, "Not authenticated. Please log in.")
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    try:
        user.password_hash = hash_password(payload.new_password)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    # Revoke other sessions
    db.query(AuthSession).filter(
        AuthSession.user_id == user.id,
        AuthSession.revoked.is_(False),
    ).update({AuthSession.revoked: True})
    db.commit()
    return {
        "message": "Password changed. Other sessions were signed out. Log in again with the new password.",
    }
