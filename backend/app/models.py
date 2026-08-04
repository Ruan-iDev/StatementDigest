"""SQLAlchemy models for LedgerFlow.

Future extension points:
- Ledger.parent_id hierarchy for nested reports / tax mapping
- Multi-currency Transaction.currency (currently ZAR via settings)
- Attachment / receipt links on Transaction
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BankType(str, enum.Enum):
    FNB = "FNB"
    DISCOVERY = "Discovery"
    OTHER = "Other"


class LedgerType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"
    CAPITAL = "capital"
    OTHER = "other"


class MatchType(str, enum.Enum):
    CONTAINS = "contains"
    EXACT = "exact"
    REGEX = "regex"
    AMOUNT_EXACT = "amount_exact"
    AMOUNT_RANGE = "amount_range"
    COMBINATION = "combination"


class ImportStatus(str, enum.Enum):
    PENDING = "pending"
    PARSING = "parsing"
    COMPLETED = "completed"
    FAILED = "failed"


class UserProfile(Base):
    """Isolated app workspace — personal/business profiles never mix data."""

    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Workspace label shown in switcher (e.g. "Personal", "Florist business")
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="My Profile")
    # individual | business — business may carry a logo for printed letterheads
    profile_type: Mapped[str] = mapped_column(String(20), nullable=False, default="individual")
    # Visible unique attestation id (e.g. LF-A1B2C3D4-E5F67890) — correlator for audits
    public_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, unique=True, index=True)
    # HMAC seal of public_id (tamper-evidence on this install; not user identity)
    attestation_seal: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # Optional personal / business details
    full_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Trading / registered business name (letterhead); falls back to full_name or name
    business_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    address_line1: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, default="South Africa")
    tax_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    # Business-only registration identifiers (SA: CIPC reg + VAT)
    business_registration_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    vat_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Relative path under data/ (e.g. logos/profile_3.png) for business letterhead
    logo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Per-profile preferences
    fy_start_month: Mapped[int] = mapped_column(Integer, default=3)
    currency: Mapped[str] = mapped_column(String(10), default="ZAR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    bank_profiles: Mapped[list["BankProfile"]] = relationship(back_populates="user_profile")
    ledgers: Mapped[list["Ledger"]] = relationship(back_populates="user_profile")
    rules: Mapped[list["Rule"]] = relationship(back_populates="user_profile")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user_profile")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="user_profile")


class BankProfile(Base):
    __tablename__ = "bank_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True, default=1
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    bank_type: Mapped[str] = mapped_column(String(50), nullable=False, default=BankType.OTHER.value)
    calibration_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user_profile: Mapped["UserProfile"] = relationship(back_populates="bank_profiles")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="bank_profile")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="bank_profile")


class Ledger(Base):
    __tablename__ = "ledgers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True, default=1
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("ledgers.id"), nullable=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    budget_monthly: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    budget_annual: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user_profile: Mapped["UserProfile"] = relationship(back_populates="ledgers")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="ledger")
    rules: Mapped[list["Rule"]] = relationship(back_populates="ledger")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True, default=1
    )
    bank_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bank_profiles.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(50), default=ImportStatus.PENDING.value)
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user_profile: Mapped["UserProfile"] = relationship(back_populates="import_batches")
    bank_profile: Mapped["BankProfile"] = relationship(back_populates="import_batches")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="import_batch")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True, default=1
    )
    bank_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bank_profiles.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    # Capitec Business: fee / principal as on the statement (amount remains cash total)
    fee_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    principal_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    balance: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ledger_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("ledgers.id"), nullable=True
    )
    is_categorised: Mapped[bool] = mapped_column(Boolean, default=False)
    rule_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("rules.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_file: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    import_batch_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("import_batches.id"), nullable=True
    )
    # Dev / self-train: mark parser mistakes (ghost lines, wrong amounts, etc.)
    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    training_reason: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    training_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trained_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user_profile: Mapped["UserProfile"] = relationship(back_populates="transactions")
    bank_profile: Mapped["BankProfile"] = relationship(back_populates="transactions")
    ledger: Mapped[Optional["Ledger"]] = relationship(back_populates="transactions")
    import_batch: Mapped[Optional["ImportBatch"]] = relationship(back_populates="transactions")
    rule: Mapped[Optional["Rule"]] = relationship(back_populates="applied_transactions")


class TrainingReason(Base):
    """Growing dropdown of reasons for parser/training feedback (per user profile)."""

    __tablename__ = "training_reasons"
    __table_args__ = (
        UniqueConstraint("user_profile_id", "code", name="uq_training_reason_profile_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    hint: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TrainingPattern(Base):
    """Patterns learned from ghost / noise feedback — applied on future imports."""

    __tablename__ = "training_patterns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False)
    match_type: Mapped[str] = mapped_column(String(40), default="contains")  # contains | exact
    pattern_value: Mapped[str] = mapped_column(Text, nullable=False)
    source_transaction_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AppUser(Base):
    """Native app login account — password stored as salted scrypt hash (never plain text)."""

    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    sessions: Mapped[list["AuthSession"]] = relationship(back_populates="user")


class AuthSession(Base):
    """Opaque session tokens (only hash stored) for authenticated API access."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("app_users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user: Mapped["AppUser"] = relationship(back_populates="sessions")


class DisclaimerAcceptance(Base):
    """Audit log: user accepted upload disclaimer before processing statements."""

    __tablename__ = "disclaimer_acceptances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    # Snapshot of profile public_id at accept time (visible correlator)
    profile_public_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    # Seal snapshot so log remains checkable if profile row is later edited
    profile_attestation_seal: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    disclaimer_version: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False, default="accept")  # accept
    context: Mapped[str] = mapped_column(String(80), default="statement_upload")
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    accepted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Optional client metadata for audit trail
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True, default=1
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    match_type: Mapped[str] = mapped_column(String(50), nullable=False)
    match_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    match_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    ledger_id: Mapped[int] = mapped_column(Integer, ForeignKey("ledgers.id"), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user_profile: Mapped["UserProfile"] = relationship(back_populates="rules")
    ledger: Mapped["Ledger"] = relationship(back_populates="rules")
    applied_transactions: Mapped[list["Transaction"]] = relationship(back_populates="rule")


class AppSettings(Base):
    """Global app settings (active profile id, etc.). Per-profile prefs live on UserProfile."""

    __tablename__ = "app_settings"
    __table_args__ = (UniqueConstraint("key", name="uq_settings_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
