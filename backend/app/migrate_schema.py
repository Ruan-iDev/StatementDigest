"""Lightweight SQLite migrations for multi-profile support."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.models import (
    AppSettings,
    BankProfile,
    ImportBatch,
    Ledger,
    Rule,
    Transaction,
    UserProfile,
)
from app.seed import STARTER_LEDGERS, DEFAULT_SETTINGS


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {r[1] for r in rows}


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
        {"n": table},
    ).fetchone()
    return row is not None


def migrate_schema(engine) -> None:
    """Add user_profiles + user_profile_id columns; backfill existing rows."""
    with engine.begin() as conn:
        # Ensure user_profiles exists (create_all also does this)
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_profiles (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(200) NOT NULL DEFAULT 'My Profile',
                    full_name VARCHAR(300),
                    email VARCHAR(300),
                    phone VARCHAR(80),
                    address_line1 VARCHAR(300),
                    address_line2 VARCHAR(300),
                    city VARCHAR(120),
                    postal_code VARCHAR(40),
                    country VARCHAR(120),
                    tax_number VARCHAR(80),
                    notes TEXT,
                    fy_start_month INTEGER DEFAULT 3,
                    currency VARCHAR(10) DEFAULT 'ZAR',
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )

        for table in (
            "bank_profiles",
            "ledgers",
            "import_batches",
            "transactions",
            "rules",
        ):
            if not _table_exists(conn, table):
                continue
            cols = _columns(conn, table)
            if "user_profile_id" not in cols:
                conn.execute(
                    text(
                        f"ALTER TABLE {table} ADD COLUMN user_profile_id INTEGER NOT NULL DEFAULT 1"
                    )
                )

        # Training / self-train columns on transactions
        if _table_exists(conn, "transactions"):
            cols = _columns(conn, "transactions")
            if "is_excluded" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE transactions ADD COLUMN is_excluded BOOLEAN NOT NULL DEFAULT 0"
                    )
                )
            if "training_reason" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN training_reason VARCHAR(80)"))
            if "training_detail" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN training_detail TEXT"))
            if "trained_at" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN trained_at DATETIME"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS training_reasons (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_profile_id INTEGER NOT NULL,
                    code VARCHAR(80) NOT NULL,
                    label VARCHAR(200) NOT NULL,
                    hint TEXT,
                    is_system BOOLEAN DEFAULT 0,
                    use_count INTEGER DEFAULT 0,
                    created_at DATETIME,
                    UNIQUE (user_profile_id, code)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS training_patterns (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_profile_id INTEGER NOT NULL,
                    reason_code VARCHAR(80) NOT NULL,
                    match_type VARCHAR(40) DEFAULT 'contains',
                    pattern_value TEXT NOT NULL,
                    source_transaction_id INTEGER,
                    hit_count INTEGER DEFAULT 0,
                    created_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_profile_id INTEGER NOT NULL,
                    profile_public_id VARCHAR(40),
                    profile_attestation_seal VARCHAR(128),
                    disclaimer_version VARCHAR(40) NOT NULL,
                    action VARCHAR(40) NOT NULL DEFAULT 'accept',
                    context VARCHAR(80) DEFAULT 'statement_upload',
                    file_count INTEGER DEFAULT 0,
                    accepted_at DATETIME,
                    user_agent TEXT
                )
                """
            )
        )

        if _table_exists(conn, "user_profiles"):
            cols = _columns(conn, "user_profiles")
            if "public_id" not in cols:
                conn.execute(text("ALTER TABLE user_profiles ADD COLUMN public_id VARCHAR(40)"))
            if "attestation_seal" not in cols:
                conn.execute(
                    text("ALTER TABLE user_profiles ADD COLUMN attestation_seal VARCHAR(128)")
                )
            if "password_hash" not in cols:
                conn.execute(
                    text("ALTER TABLE user_profiles ADD COLUMN password_hash VARCHAR(500)")
                )
            if "workspace_username" not in cols:
                conn.execute(
                    text("ALTER TABLE user_profiles ADD COLUMN workspace_username VARCHAR(120)")
                )
            if "profile_type" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE user_profiles ADD COLUMN profile_type VARCHAR(20) "
                        "NOT NULL DEFAULT 'individual'"
                    )
                )
            if "business_name" not in cols:
                conn.execute(
                    text("ALTER TABLE user_profiles ADD COLUMN business_name VARCHAR(300)")
                )
            if "logo_path" not in cols:
                conn.execute(
                    text("ALTER TABLE user_profiles ADD COLUMN logo_path VARCHAR(500)")
                )
            if "business_registration_number" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE user_profiles ADD COLUMN business_registration_number VARCHAR(80)"
                    )
                )
            if "vat_number" not in cols:
                conn.execute(
                    text("ALTER TABLE user_profiles ADD COLUMN vat_number VARCHAR(80)")
                )

        if _table_exists(conn, "transactions"):
            cols = _columns(conn, "transactions")
            if "fee_amount" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN fee_amount NUMERIC(18, 2)"))
            if "principal_amount" not in cols:
                conn.execute(
                    text("ALTER TABLE transactions ADD COLUMN principal_amount NUMERIC(18, 2)")
                )

        if _table_exists(conn, "disclaimer_acceptances"):
            cols = _columns(conn, "disclaimer_acceptances")
            if "profile_public_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE disclaimer_acceptances ADD COLUMN profile_public_id VARCHAR(40)"
                    )
                )
            if "profile_attestation_seal" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE disclaimer_acceptances ADD COLUMN profile_attestation_seal VARCHAR(128)"
                    )
                )

        # Double-entry bookkeeping (bank accounts as ledgers)
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS bank_accounts (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_profile_id INTEGER NOT NULL,
                    bank_profile_id INTEGER,
                    account_number VARCHAR(40) NOT NULL,
                    bank_name VARCHAR(80),
                    product VARCHAR(200),
                    name VARCHAR(200) NOT NULL,
                    account_kind VARCHAR(20) NOT NULL DEFAULT 'asset',
                    ledger_id INTEGER,
                    opening_balance NUMERIC(18, 2),
                    opening_date DATE,
                    opening_source VARCHAR(500),
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME,
                    CONSTRAINT uq_bank_account_profile_number UNIQUE (user_profile_id, account_number)
                )
                """
            )
        )
        if _table_exists(conn, "ledgers") and "system_role" not in _columns(conn, "ledgers"):
            conn.execute(text("ALTER TABLE ledgers ADD COLUMN system_role VARCHAR(40)"))
        if _table_exists(conn, "import_batches"):
            cols = _columns(conn, "import_batches")
            for name, ddl in (
                ("bank_account_id", "INTEGER"),
                ("account_number", "VARCHAR(40)"),
                ("statement_opening", "NUMERIC(18, 2)"),
                ("statement_closing", "NUMERIC(18, 2)"),
                ("period_start", "DATE"),
                ("period_end", "DATE"),
                ("source_upload", "VARCHAR(500)"),
                ("meta_source", "VARCHAR(40)"),
            ):
                if name not in cols:
                    conn.execute(text(f"ALTER TABLE import_batches ADD COLUMN {name} {ddl}"))
        if _table_exists(conn, "transactions") and "bank_account_id" not in _columns(
            conn, "transactions"
        ):
            conn.execute(text("ALTER TABLE transactions ADD COLUMN bank_account_id INTEGER"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_transactions_bank_account_id "
                "ON transactions (bank_account_id)"
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS app_users (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    username VARCHAR(120) NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS auth_sessions (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash VARCHAR(128) NOT NULL UNIQUE,
                    created_at DATETIME,
                    expires_at DATETIME NOT NULL,
                    revoked BOOLEAN DEFAULT 0,
                    user_agent TEXT
                )
                """
            )
        )


def ensure_default_profile(db: Session) -> UserProfile:
    """Create default profile, attach orphan rows, seed ledgers if needed."""
    from app.attestation import ensure_profile_attestation

    profile = db.query(UserProfile).order_by(UserProfile.id.asc()).first()
    if not profile:
        fy = DEFAULT_SETTINGS.get("fy_start_month", "3")
        cur = DEFAULT_SETTINGS.get("currency", "ZAR")
        # Prefer existing app_settings if present
        for key in ("fy_start_month", "currency"):
            row = db.query(AppSettings).filter(AppSettings.key == key).first()
            if row and key == "fy_start_month":
                fy = row.value
            if row and key == "currency":
                cur = row.value
        profile = UserProfile(
            name="My Profile",
            full_name=None,
            country="South Africa",
            fy_start_month=int(fy),
            currency=cur or "ZAR",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    pid = profile.id

    # Backfill any rows still missing a valid profile (defensive)
    for model in (BankProfile, Ledger, ImportBatch, Transaction, Rule):
        db.query(model).filter(
            (model.user_profile_id.is_(None)) | (model.user_profile_id == 0)
        ).update({model.user_profile_id: pid}, synchronize_session=False)
    db.commit()

    # Active profile setting
    active = db.query(AppSettings).filter(AppSettings.key == "active_user_profile_id").first()
    if not active:
        db.add(AppSettings(key="active_user_profile_id", value=str(pid)))
        db.commit()

    # Seed ledgers for this profile if empty
    if db.query(Ledger).filter(Ledger.user_profile_id == pid).count() == 0:
        for item in STARTER_LEDGERS:
            db.add(
                Ledger(
                    user_profile_id=pid,
                    name=item["name"],
                    type=item["type"],
                    is_system=True,
                    is_archived=False,
                    budget_monthly=None,
                    budget_annual=None,
                    sort_order=item["sort_order"],
                )
            )
        db.commit()

    # Attestation IDs for all profiles
    for p in db.query(UserProfile).all():
        ensure_profile_attestation(db, p)

    return profile
