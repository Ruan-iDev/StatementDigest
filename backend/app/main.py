"""LedgerFlow FastAPI application – 100% local, no cloud services."""

from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    auth,
    bank_accounts,
    bank_profiles,
    disclaimers,
    imports,
    ledgers,
    license as license_api,
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
from app.modules.registry import mount_modules, modules_public_payload
from app.security import hash_token

ensure_data_dirs()
app_settings = get_settings()

app = FastAPI(
    title="LedgerFlow API",
    description="Local-first personal finance: statements → ledgers → P&L",
    version="2.1.3",
)


# Public paths (no session required)
_AUTH_PUBLIC_EXACT = {
    "/api/health",
    "/api/auth/status",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/guest",
    "/api/auth/suggest-password",
    "/api/license/status",
    "/api/license/activate",
    "/docs",
    "/openapi.json",
    "/redoc",
}

# Mutations always allowed for auth + license (even in read-only trial)
_LICENSE_WRITE_ALWAYS = (
    "/api/health",
    "/api/auth/",
    "/api/license/",
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

    # Guest sessions: full app access for try-before-account (writes allowed).
    # Token is in-memory only; data still lands in local SQLite like a normal session.
    if is_guest_token(token):
        request.state.is_guest = True
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

    # Option C: after trial — allow viewing (GET) but block edits/exports until unlock
    write_exempt = any(path == p or path.startswith(p) for p in _LICENSE_WRITE_ALWAYS)
    if not write_exempt:
        from app.database import SessionLocal as _SL
        from app.license import get_license_status

        ldb = _SL()
        try:
            st = get_license_status(ldb)
            if st.read_only:
                method = request.method.upper()
                is_export = "/pdf" in path or path.rstrip("/").endswith("/export")
                is_mutation = method not in ("GET", "HEAD", "OPTIONS")
                if is_mutation or is_export:
                    return JSONResponse(
                        {
                            "detail": (
                                "Read-only mode: your 30-day tester access has ended. "
                                "You can view your data, but changes and exports need an unlock key."
                            ),
                            "code": "trial_read_only",
                            "days_remaining": st.days_remaining,
                            "expired": True,
                            "licensed": st.licensed,
                            "read_only": True,
                        },
                        status_code=402,
                    )
        finally:
            ldb.close()

    return await call_next(request)


# CORS must be outermost so early 401/402/403 JSONResponses from auth still get
# Access-Control-* headers. (add_middleware inserts at front of the stack.)
# Do not use "*" with allow_credentials=True — browsers reject that combo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router, prefix="/api")
app.include_router(license_api.router, prefix="/api")
app.include_router(profiles.router, prefix="/api")
app.include_router(disclaimers.router, prefix="/api")
app.include_router(local_data.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(ledgers.router, prefix="/api")
app.include_router(bank_profiles.router, prefix="/api")
app.include_router(bank_accounts.router, prefix="/api")
app.include_router(imports.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
mount_modules(app)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    # Silent trial start on first open of this install
    from app.database import SessionLocal
    from app.license import ensure_trial_started

    db = SessionLocal()
    try:
        ensure_trial_started(db)
    finally:
        db.close()


@app.get("/api/modules")
def list_modules():
    """Enabled bolt-on modules shipped with this build."""
    return {"modules": modules_public_payload()}


@app.get("/api/health")
def health():
    # Keep in sync with repo root VERSION (desktop builds may set LEDGERFLOW_APP_VERSION).
    import os

    version = (os.environ.get("LEDGERFLOW_APP_VERSION") or "2.1.3").strip() or "2.1.3"

    return {
        "status": "ok",
        "app": "LedgerFlow",
        "local": True,
        "version": version,
    }
