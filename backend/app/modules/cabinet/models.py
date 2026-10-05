"""Cabinet Flow tables. Production jobcards, separate from Work Flow documents."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CabinetJob(Base):
    __tablename__ = "cabinet_jobs"
    __table_args__ = (UniqueConstraint("user_profile_id", "number", name="uq_cabinet_job_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_profile_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_profiles.id"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(20), nullable=False)
    party_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("practice_parties.id"), nullable=False, index=True
    )
    project_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_projects.id"), nullable=True, index=True
    )
    job_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    lines: Mapped[list["CabinetJobLine"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="CabinetJobLine.sort_order",
    )


class CabinetJobLine(Base):
    __tablename__ = "cabinet_job_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("cabinet_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("practice_stock_items.id"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 3), nullable=False, default=Decimal("1"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    family: Mapped[str] = mapped_column(String(32), nullable=False, default="quantitative")
    group_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    length_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    width_mm: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), nullable=True)
    # Set on cutting labour that follows the sheets of another product on this jobcard.
    source_product_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # Outermost group first. Each item is {key, name, collapsed}.
    bundle_path: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0"))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("0"))
    line_ex_vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0"))
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0"))
    line_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=Decimal("0"))

    job: Mapped[CabinetJob] = relationship(back_populates="lines")
