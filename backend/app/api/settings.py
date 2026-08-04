from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile, get_active_profile_id
from app.models import ImportBatch, Ledger, Rule, Transaction, UserProfile
from app.schemas import DashboardStats, ImportBatchOut, SettingsOut, SettingsUpdate
from app.services.money import quantize_money

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return SettingsOut(
        fy_start_month=profile.fy_start_month or 3,
        currency=profile.currency or "ZAR",
        active_profile_id=profile.id,
        active_profile_name=profile.name,
    )


@router.patch("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    data = payload.model_dump(exclude_unset=True)
    if "fy_start_month" in data and data["fy_start_month"] is not None:
        profile.fy_start_month = int(data["fy_start_month"])
    if "currency" in data and data["currency"] is not None:
        profile.currency = str(data["currency"])
    db.commit()
    db.refresh(profile)
    return get_settings(db, profile)


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    pending = (
        db.query(Transaction)
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_categorised.is_(False),
            Transaction.is_excluded.is_(False),
        )
        .count()
    )
    total = (
        db.query(Transaction)
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_excluded.is_(False),
        )
        .count()
    )
    categorised = (
        db.query(Transaction)
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_categorised.is_(True),
            Transaction.is_excluded.is_(False),
        )
        .count()
    )
    ledger_count = (
        db.query(Ledger)
        .filter(Ledger.user_profile_id == profile_id, Ledger.is_archived.is_(False))
        .count()
    )
    rule_count = (
        db.query(Rule)
        .filter(Rule.user_profile_id == profile_id, Rule.is_active.is_(True))
        .count()
    )

    batches = (
        db.query(ImportBatch)
        .filter(ImportBatch.user_profile_id == profile_id)
        .order_by(ImportBatch.uploaded_at.desc())
        .limit(5)
        .all()
    )
    recent = [
        ImportBatchOut(
            id=b.id,
            bank_profile_id=b.bank_profile_id,
            filename=b.filename,
            uploaded_at=b.uploaded_at,
            status=b.status,
            transaction_count=b.transaction_count,
            error_message=b.error_message,
            bank_profile_name=b.bank_profile.name if b.bank_profile else None,
        )
        for b in batches
    ]

    today = date.today()
    mtd_rows = (
        db.query(Transaction.amount, Ledger.type)
        .join(Ledger, Transaction.ledger_id == Ledger.id)
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_categorised.is_(True),
            extract("year", Transaction.date) == today.year,
            extract("month", Transaction.date) == today.month,
        )
        .all()
    )
    income_mtd = Decimal("0")
    expenses_mtd = Decimal("0")
    for amount, ltype in mtd_rows:
        amt = Decimal(str(amount))
        if ltype == "income":
            income_mtd += amt
        elif ltype == "expense":
            expenses_mtd += abs(amt)

    return DashboardStats(
        pending_count=pending,
        total_transactions=total,
        categorised_count=categorised,
        ledger_count=ledger_count,
        rule_count=rule_count,
        recent_batches=recent,
        income_mtd=quantize_money(income_mtd),
        expenses_mtd=quantize_money(expenses_mtd),
    )
