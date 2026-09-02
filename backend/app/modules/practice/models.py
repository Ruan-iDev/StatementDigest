"""Practice tables. Prefixed so they never collide with core statement/ledger tables."""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Optional

from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PartyKind(str, enum.Enum):
    CLIENT = "client"  # debtor
    SUPPLIER = "supplier"  # creditor


class ProjectStatus(str, enum.Enum):
    OPEN = "open"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EntryType(str, enum.Enum):
    NOTE = "note"
    QUOTE = "quote"
    INVOICE = "invoice"
    EXPENSE = "expense"
    FILE = "file"
    STATUS = "status"
    TASK = "task"
    PAYMENT = "payment"
    MEETING = "meeting"
    WAGE = "wage"


class DocumentKind(str, enum.Enum):
    QUOTE = "quote"
    INVOICE = "invoice"


class DocumentStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    INVOICED = "invoiced"
    PAID = "paid"
    VOID = "void"


class PracticeParty(Base):
    """Client (debtor) or supplier (creditor) card."""

    __tablename__ = "practice_parties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # individual | business — business shows CIPC / VAT on quotes and invoices
    party_type: Mapped[str] = mapped_column(String(20), nullable=False, default="individual")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    business_registration_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    trading_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    address_line1: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, default="South Africa")
    tax_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    vat_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    projects: Mapped[list["PracticeProject"]] = relationship(back_populates="client")


class PracticeProject(Base):
    """A job / project file — the spine of Practice."""

    __tablename__ = "practice_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    client_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_parties.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=ProjectStatus.OPEN.value)
    started_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    client: Mapped[Optional["PracticeParty"]] = relationship(back_populates="projects")
    entries: Mapped[list["PracticeEntry"]] = relationship(
        back_populates="project", order_by="PracticeEntry.occurred_on.asc()"
    )


class PracticeSettings(Base):
    """Per-workspace on/off switches for value-added Practice features."""

    __tablename__ = "practice_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, unique=True, index=True
    )
    quotes_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    invoices_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    projects_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # One Practice logo for quotes, invoices, and project statements
    logo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # When True, From/issuer on quotes & invoices uses My Profile. Default off.
    use_profile_issuer: Mapped[bool] = mapped_column(Boolean, default=False)
    issuer_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Shared VAT for the whole Practice workspace (quotes, invoices, later surfaces).
    vat_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("15.000"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeTemplate(Base):
    """Per-kind document defaults. Quotes and invoices never share these fields."""

    __tablename__ = "practice_templates"
    __table_args__ = (
        UniqueConstraint("user_profile_id", "kind", name="uq_practice_template_profile_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # quote | invoice
    # Legacy columns — VAT now lives on PracticeSettings. Left in place for SQLite.
    vat_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("15.000"))
    # Sequence: QTE-001 / INV-001 — system increments number_next after each save
    number_prefix: Mapped[str] = mapped_column(String(20), nullable=False, default="QTE")
    number_width: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    number_next: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    bank_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bank_account_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    bank_branch_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    bank_extra: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    disclaimer: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeDocument(Base):
    """Quote or invoice. Independent of projects; may optionally sit on a project file."""

    __tablename__ = "practice_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    issued_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    due_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    party_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_parties.id"), nullable=True, index=True
    )
    project_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_projects.id"), nullable=True, index=True
    )
    # Invoice only — core income ledger (Sales / Invoice Income, etc.)
    income_ledger_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("ledgers.id"), nullable=True, index=True
    )
    source_quote_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_documents.id"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=DocumentStatus.DRAFT.value)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Ordered note blocks: [{type: text|image, body?, path?, filename?}]
    notes_json: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    vat_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("15.000"))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    issuer_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    client_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    bank_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    disclaimer_snapshot: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    party: Mapped[Optional["PracticeParty"]] = relationship()
    project: Mapped[Optional["PracticeProject"]] = relationship()
    lines: Mapped[list["PracticeDocumentLine"]] = relationship(
        back_populates="document",
        order_by="PracticeDocumentLine.sort_order",
        cascade="all, delete-orphan",
    )


class PracticeDocumentLine(Base):
    """A line on a quote or invoice."""

    __tablename__ = "practice_document_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_documents.id"), nullable=False, index=True
    )
    item: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    description: Mapped[str] = mapped_column(String(800), nullable=False, default="")
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("1.00"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    document: Mapped["PracticeDocument"] = relationship(back_populates="lines")


class PracticeExpense(Base):
    """Running cost on a project file, assigned to a core expense ledger."""

    __tablename__ = "practice_expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_projects.id"), nullable=False, index=True
    )
    ledger_id: Mapped[int] = mapped_column(Integer, ForeignKey("ledgers.id"), nullable=False, index=True)
    supplier_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_parties.id"), nullable=True, index=True
    )
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    vendor_name: Mapped[Optional[str]] = mapped_column(String(240), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    incurred_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project: Mapped[Optional["PracticeProject"]] = relationship()


class PracticeProduct(Base):
    """Reusable quote/invoice lines — goods, labour, or anything else that repeats.

    Table name stays ``practice_stock_items`` so existing local DBs keep their rows.
    """

    __tablename__ = "practice_stock_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    supplier_stock_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    markup_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    retail_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0.00"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeStaff(Base):
    """Person on the books — wages, later payslips and biometric clock-in."""

    __tablename__ = "practice_staff"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    known_as: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    job_title: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    id_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    born_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    address_line1: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, default="South Africa")
    bank_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    bank_account_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    bank_branch_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    wage_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    wage_period: Mapped[str] = mapped_column(String(20), nullable=False, default="week")
    photo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PracticeWage(Base):
    """Wage paid to staff against a project file.

    ``amount`` is the net paid. Per-day staff store ``days`` × snapshotted
    ``rate_amount``; ``additions`` (favours, boosts) add on and
    ``deductions`` come off. ``notes`` are kept for later HR reporting.
    ``rate_amount`` / ``rate_period`` are frozen at save time so a later
    staff-card increase never rewrites the books.
    """

    __tablename__ = "practice_wages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_projects.id"), nullable=False, index=True
    )
    staff_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_staff.id"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    days: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    rate_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    rate_period: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    deductions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    additions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    occurred_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PracticeStaffWageHistory(Base):
    """Dated wage rate changes on a staff card — HR paper trail."""

    __tablename__ = "practice_staff_wage_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    staff_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_staff.id"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False, default="week")
    previous_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    previous_period: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="start")
    effective_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PracticeEntry(Base):
    """Dated paper trail on a project file. Every +Add lands here."""

    __tablename__ = "practice_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_projects.id"), nullable=False, index=True
    )
    entry_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_documents.id"), nullable=True
    )
    expense_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_expenses.id"), nullable=True
    )
    wage_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_wages.id"), nullable=True
    )
    occurred_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    occurred_time: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    project: Mapped["PracticeProject"] = relationship(back_populates="entries")
