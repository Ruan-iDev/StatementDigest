"""LedgerFlow FastAPI application – 100% local, no cloud services."""

from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    auth,
    bank_profiles,
    disclaimers,
    imports,
    ledgers,
    local_data,
    profiles,
    reports,
    rules,
    settings,
    transactions,
)
from app.config import ensure_data_dirs, get_settings
from app.database import SessionLocal, init_db
from app.guest_sessions import is_guest_token
from app.models import AuthSession
from app.security import hash_token

ensure_data_dirs()
app_settings = get_settings()

app = FastAPI(
    title="LedgerFlow API",
    description="Local-first personal finance: statements → ledgers → P&L",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public paths (no session required)
_AUTH_PUBLIC_EXACT = {
    "/api/health",
    "/api/auth/status",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/guest",
    "/api/auth/suggest-password",
    "/docs",
    "/openapi.json",
    "/redoc",
}

# Guest may call these non-GET endpoints only
_GUEST_WRITE_ALLOWED = {
    "/api/auth/logout",
    # Reveal local folder only — no app data is written or uploaded
    "/api/local-data/open",
}

_GUEST_WRITE_BLOCK_MSG = (
    "Guest mode — nothing is saved. Create an account if you want to keep your data."
)


@app.middleware("http")
async def require_auth_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if path in _AUTH_PUBLIC_EXACT or path.startswith("/docs") or path.startswith("/redoc"):
        return await call_next(request)
    if not path.startswith("/api/"):
        return await call_next(request)

    auth_header = request.headers.get("Authorization") or ""
    token = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return JSONResponse({"detail": "Not authenticated. Please log in."}, status_code=401)

    # Ephemeral guest session (in-memory only — no account, no durable session row)
    if is_guest_token(token):
        request.state.is_guest = True
        if request.method not in ("GET", "HEAD", "OPTIONS") and path not in _GUEST_WRITE_ALLOWED:
            return JSONResponse({"detail": _GUEST_WRITE_BLOCK_MSG}, status_code=403)
        return await call_next(request)

    request.state.is_guest = False
    db = SessionLocal()
    try:
        sess = (
            db.query(AuthSession)
            .filter(
                AuthSession.token_hash == hash_token(token),
                AuthSession.revoked.is_(False),
                AuthSession.expires_at > datetime.utcnow(),
            )
            .first()
        )
        if not sess:
            return JSONResponse(
                {"detail": "Session expired or invalid. Please log in."}, status_code=401
            )
    finally:
        db.close()

    return await call_next(request)


app.include_router(auth.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(disclaimers.router, prefix="/api")
app.include_router(local_data.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(ledgers.router, prefix="/api")
app.include_router(bank_profiles.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health():
    # Keep in sync with repo root VERSION (desktop builds may set LEDGERFLOW_APP_VERSION).
    import os

    version = (os.environ.get("LEDGERFLOW_APP_VERSION") or "1.0.0").strip() or "1.0.0"
    return {
        "status": "ok",
        "app": "LedgerFlow",
        "local": True,
        "version": version,
    }
