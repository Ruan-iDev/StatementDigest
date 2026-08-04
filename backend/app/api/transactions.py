from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, extract, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_active_profile_id
from app.models import BankProfile, Ledger, Rule, Transaction
from app.schemas import (
    BulkCategoriseRequest,
    BulkCategoriseResult,
    CreateRuleFromTransactionRequest,
    RuleApplyResult,
    RuleOut,
    TrainTransactionRequest,
    TrainTransactionResult,
    TrainingReasonOut,
    TransactionOut,
    TransactionUpdate,
)
from app.services.rules_engine import apply_rule_to_pending, apply_all_rules_to_pending
from app.services.training import list_reasons, submit_training

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TxPeriodMonth(BaseModel):
    month: int
    count: int


class TxPeriodYear(BaseModel):
    year: int
    count: int
    months: list[TxPeriodMonth] = Field(default_factory=list)


class TxPeriodsOut(BaseModel):
    total: int
    years: list[TxPeriodYear] = Field(default_factory=list)


class WipeTransactionsRequest(BaseModel):
    """Dev/test helper: bulk-delete transactions by year or year+month."""

    year: int = Field(..., ge=1990, le=2100)
    month: Optional[int] = Field(
        None,
        ge=1,
        le=12,
        description="If omitted, wipe the whole year. If set, wipe that month only.",
    )


class WipeTransactionsResult(BaseModel):
    deleted: int
    year: int
    month: Optional[int] = None
    message: str


def _tx_out(tx: Transaction) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        bank_profile_id=tx.bank_profile_id,
        date=tx.date,
        description=tx.description,
        amount=tx.amount,
        fee_amount=getattr(tx, "fee_amount", None),
        principal_amount=getattr(tx, "principal_amount", None),
        balance=tx.balance,
        reference=tx.reference,
        ledger_id=tx.ledger_id,
        is_categorised=tx.is_categorised,
        rule_id=tx.rule_id,
        notes=tx.notes,
        source_file=tx.source_file,
        import_batch_id=tx.import_batch_id,
        is_excluded=bool(getattr(tx, "is_excluded", False)),
        training_reason=getattr(tx, "training_reason", None),
        training_detail=getattr(tx, "training_detail", None),
        trained_at=getattr(tx, "trained_at", None),
        created_at=tx.created_at,
        bank_profile_name=tx.bank_profile.name if tx.bank_profile else None,
        ledger_name=tx.ledger.name if tx.ledger else None,
    )


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    pending_only: bool = False,
    categorised_only: bool = False,
    ledger_id: Optional[int] = None,
    bank_profile_id: Optional[int] = None,
    q: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    query = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.bank_profile),
            joinedload(Transaction.ledger),
        )
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_excluded.is_(False),
        )
    )
    if pending_only:
        query = query.filter(Transaction.is_categorised.is_(False))
    if categorised_only:
        query = query.filter(Transaction.is_categorised.is_(True))
    if ledger_id is not None:
        query = query.filter(Transaction.ledger_id == ledger_id)
    if bank_profile_id is not None:
        query = query.filter(Transaction.bank_profile_id == bank_profile_id)
    if date_from:
        query = query.filter(Transaction.date >= date_from)
    if date_to:
        query = query.filter(Transaction.date <= date_to)
    if q and q.strip():
        query = _apply_transaction_search(query, q.strip())

    rows = (
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_tx_out(t) for t in rows]


def _apply_transaction_search(query, term: str):
    """Match term against any useful transaction field (text, dates, amounts, ledger, bank)."""
    like = f"%{term}%"
    # Amounts: strip common currency noise so "R 1,234.50" still hits 1234.50
    amount_term = (
        term.replace("R", "")
        .replace("r", "")
        .replace("$", "")
        .replace(",", "")
        .replace(" ", "")
        .strip()
    )
    amount_like = f"%{amount_term}%" if amount_term else like

    # Outer-join related names so unallocated rows still match on other fields
    query = query.outerjoin(Transaction.ledger).outerjoin(Transaction.bank_profile)

    clauses = [
        Transaction.description.ilike(like),
        Transaction.reference.ilike(like),
        Transaction.notes.ilike(like),
        Transaction.source_file.ilike(like),
        Transaction.training_reason.ilike(like),
        Transaction.training_detail.ilike(like),
        # ISO date string e.g. 2024-03-15 / 2024-03 / 03-15
        cast(Transaction.date, String).ilike(like),
        # Numeric columns as text (sign, decimals)
        cast(Transaction.amount, String).ilike(amount_like),
        cast(Transaction.fee_amount, String).ilike(amount_like),
        cast(Transaction.principal_amount, String).ilike(amount_like),
        cast(Transaction.balance, String).ilike(amount_like),
        cast(Transaction.id, String).ilike(like),
        Ledger.name.ilike(like),
        Ledger.type.ilike(like),
        BankProfile.name.ilike(like),
        BankProfile.bank_type.ilike(like),
    ]

    # Day/month fragments: "15/03/2024", "15-03", "03/2024"
    slashy = term.replace("/", "-").replace(".", "-")
    if slashy != term:
        clauses.append(cast(Transaction.date, String).ilike(f"%{slashy}%"))

    return query.filter(or_(*clauses)).distinct()


@router.get("/pending/count")
def pending_count(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    count = (
        db.query(Transaction)
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_categorised.is_(False),
            Transaction.is_excluded.is_(False),
        )
        .count()
    )
    return {"count": count}


@router.get("/training/reasons", response_model=list[TrainingReasonOut])
def training_reasons(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Dropdown reasons for the DEV self-train control."""
    rows = list_reasons(db, profile_id)
    return [
        TrainingReasonOut(
            code=r.code,
            label=r.label,
            hint=r.hint,
            is_system=bool(r.is_system),
            use_count=int(r.use_count or 0),
        )
        for r in rows
    ]


@router.post("/{tx_id}/train", response_model=TrainTransactionResult)
def train_on_transaction(
    tx_id: int,
    payload: TrainTransactionRequest,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """DEV: flag a parser mistake; ghosts are excluded and patterns are learned."""
    tx = db.get(Transaction, tx_id)
    if not tx or tx.user_profile_id != profile_id:
        raise HTTPException(404, "Transaction not found")
    updated = submit_training(
        db,
        tx,
        reason_code=payload.reason_code,
        detail=payload.detail,
        custom_label=payload.custom_label,
    )
    msg = (
        "Ghost excluded and pattern remembered for future imports."
        if updated.is_excluded
        else "Feedback recorded. Thank you for training the parser."
    )
    return TrainTransactionResult(
        transaction_id=updated.id,
        is_excluded=bool(updated.is_excluded),
        training_reason=updated.training_reason or payload.reason_code,
        message=msg,
    )


@router.get("/periods", response_model=TxPeriodsOut)
def list_transaction_periods(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Years/months present for the active profile (dev wipe UI)."""
    base = db.query(Transaction).filter(
        Transaction.user_profile_id == profile_id,
        Transaction.is_excluded.is_(False),
    )
    total = base.count()
    if total == 0:
        return TxPeriodsOut(total=0, years=[])

    year_rows = (
        db.query(
            extract("year", Transaction.date).label("year"),
            func.count(Transaction.id).label("count"),
        )
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_excluded.is_(False),
        )
        .group_by(extract("year", Transaction.date))
        .order_by(extract("year", Transaction.date).desc())
        .all()
    )

    month_rows = (
        db.query(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.count(Transaction.id).label("count"),
        )
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.is_excluded.is_(False),
        )
        .group_by(extract("year", Transaction.date), extract("month", Transaction.date))
        .order_by(
            extract("year", Transaction.date).desc(),
            extract("month", Transaction.date).asc(),
        )
        .all()
    )

    months_by_year: dict[int, list[TxPeriodMonth]] = {}
    for y, m, c in month_rows:
        yi, mi, ci = int(y), int(m), int(c)
        months_by_year.setdefault(yi, []).append(TxPeriodMonth(month=mi, count=ci))

    years = [
        TxPeriodYear(
            year=int(y),
            count=int(c),
            months=months_by_year.get(int(y), []),
        )
        for y, c in year_rows
    ]
    return TxPeriodsOut(total=total, years=years)


@router.post("/wipe", response_model=WipeTransactionsResult)
def wipe_transactions(
    payload: WipeTransactionsRequest,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """DEV/TEST: permanently delete transactions for a year or a single month (active profile only)."""
    q = db.query(Transaction).filter(
        Transaction.user_profile_id == profile_id,
        extract("year", Transaction.date) == payload.year,
    )
    if payload.month is not None:
        q = q.filter(extract("month", Transaction.date) == payload.month)

    deleted = q.delete(synchronize_session=False)
    db.commit()

    if payload.month is not None:
        label = f"{payload.year}-{payload.month:02d}"
    else:
        label = str(payload.year)

    return WipeTransactionsResult(
        deleted=deleted,
        year=payload.year,
        month=payload.month,
        message=f"Deleted {deleted} transaction(s) for {label}.",
    )


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    tx = db.get(Transaction, tx_id)
    if not tx or tx.user_profile_id != profile_id:
        raise HTTPException(404, "Transaction not found")
    data = payload.model_dump(exclude_unset=True)
    if "ledger_id" in data:
        lid = data["ledger_id"]
        if lid is not None:
            ledger = db.get(Ledger, lid)
            if not ledger or ledger.user_profile_id != profile_id:
                raise HTTPException(400, "Ledger not found")
            tx.ledger_id = lid
            tx.is_categorised = True
            tx.rule_id = None  # manual override
        else:
            tx.ledger_id = None
            tx.is_categorised = False
            tx.rule_id = None
    if "notes" in data:
        tx.notes = data["notes"]
    if "is_categorised" in data and data["is_categorised"] is not None:
        tx.is_categorised = data["is_categorised"]
        if not tx.is_categorised:
            tx.ledger_id = None
            tx.rule_id = None
    db.commit()
    db.refresh(tx)
    # reload relationships
    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.bank_profile), joinedload(Transaction.ledger))
        .filter(Transaction.id == tx_id)
        .one()
    )
    return _tx_out(tx)


@router.post("/bulk-categorise", response_model=BulkCategoriseResult)
def bulk_categorise(
    payload: BulkCategoriseRequest,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    ledger = db.get(Ledger, payload.ledger_id)
    if not ledger or ledger.user_profile_id != profile_id:
        raise HTTPException(400, "Ledger not found")
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.id.in_(payload.transaction_ids),
            Transaction.user_profile_id == profile_id,
        )
        .all()
    )
    for tx in txs:
        tx.ledger_id = payload.ledger_id
        tx.is_categorised = True
        tx.rule_id = None
    db.commit()
    return BulkCategoriseResult(updated=len(txs))


@router.post("/create-rule", response_model=RuleApplyResult)
def create_rule_from_transactions(
    payload: CreateRuleFromTransactionRequest,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Create rule from selection, then live-strip entire pending queue."""
    ledger = db.get(Ledger, payload.ledger_id)
    if not ledger or ledger.user_profile_id != profile_id:
        raise HTTPException(400, "Ledger not found")

    match_value = payload.match_value
    if not match_value and payload.transaction_ids:
        first = db.get(Transaction, payload.transaction_ids[0])
        if first and first.user_profile_id == profile_id:
            match_value = first.description

    rule = Rule(
        user_profile_id=profile_id,
        name=payload.name,
        match_type=payload.match_type,
        match_value=match_value,
        match_json=payload.match_json,
        ledger_id=payload.ledger_id,
        priority=payload.priority,
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    # Force-categorise selected txs
    if payload.force_selected and payload.transaction_ids:
        selected = (
            db.query(Transaction)
            .filter(
                Transaction.id.in_(payload.transaction_ids),
                Transaction.user_profile_id == profile_id,
            )
            .all()
        )
        for tx in selected:
            tx.ledger_id = payload.ledger_id
            tx.is_categorised = True
            tx.rule_id = rule.id
        db.commit()

    # Live strip remaining pending queue with this rule (and higher-priority rules stay)
    matched = apply_rule_to_pending(db, rule)

    return RuleApplyResult(
        rule_id=rule.id,
        matched=matched,
        message=f"Rule '{rule.name}' saved and applied. {matched} transaction(s) stripped from pending.",
    )


@router.post("/apply-rules", response_model=RuleApplyResult)
def reapply_all_rules(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    matched = apply_all_rules_to_pending(db, user_profile_id=profile_id)
    return RuleApplyResult(
        rule_id=0,
        matched=matched,
        message=f"Re-ran all active rules. {matched} transaction(s) categorised.",
    )
