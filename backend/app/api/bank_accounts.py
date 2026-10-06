"""Real bank / loan accounts (double-entry bank side)."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile_id
from app.models import BankAccount, ImportBatch, Ledger, LedgerType, Transaction
from app.schemas import BankAccountOut, BankAccountUpdate
from app.services.bank_accounts import backfill_profile, statements_for_account, sync_account_ledger

router = APIRouter(prefix="/bank-accounts", tags=["bank-accounts"])


def _out(db: Session, a: BankAccount, ledger_balance: Decimal | None = None) -> BankAccountOut:
    stmts = statements_for_account(db, a)
    tx_count, tx_sum = (
        db.query(func.count(Transaction.id), func.coalesce(func.sum(Transaction.amount), 0))
        .filter(Transaction.bank_account_id == a.id, Transaction.is_excluded.is_(False))
        .one()
    )
    lg = db.get(Ledger, a.ledger_id) if a.ledger_id else None
    last_closing = next((b.statement_closing for b in reversed(stmts) if b.statement_closing is not None), None)
    return BankAccountOut(
        id=a.id,
        account_number=a.account_number,
        name=a.name,
        bank_name=a.bank_name,
        product=a.product,
        account_kind=a.account_kind,
        ledger_id=a.ledger_id,
        ledger_name=lg.name if lg else None,
        bank_profile_id=a.bank_profile_id,
        opening_balance=a.opening_balance,
        opening_date=a.opening_date,
        opening_source=a.opening_source,
        statements=len(stmts),
        transactions=int(tx_count or 0),
        first_period_start=stmts[0].period_start if stmts else None,
        last_period_end=stmts[-1].period_end if stmts else None,
        last_printed_closing=last_closing,
        ledger_balance=(
            ledger_balance
            if ledger_balance is not None
            else (Decimal(str(a.opening_balance or 0)) + Decimal(str(tx_sum or 0))).quantize(Decimal("0.01"))
        ),
    )


@router.get("", response_model=list[BankAccountOut])
def list_bank_accounts(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    rows = (
        db.query(BankAccount)
        .filter(BankAccount.user_profile_id == profile_id)
        .order_by(BankAccount.name)
        .all()
    )
    from app.services.double_entry import build_books

    bal = build_books(db, profile_id).balances() if rows else {}
    # Ledger balance from the journal (incl. statement-gap adjustments) = bank balance
    return [_out(db, a, Decimal(str(bal.get(a.ledger_id, 0))).quantize(Decimal("0.01"))) for a in rows]


@router.patch("/{account_id}", response_model=BankAccountOut)
def update_bank_account(
    account_id: int,
    payload: BankAccountUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    a = db.get(BankAccount, account_id)
    if not a or a.user_profile_id != profile_id:
        raise HTTPException(404, "Bank account not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        a.name = name[:200]
    if payload.account_kind is not None:
        if payload.account_kind not in (LedgerType.ASSET.value, LedgerType.LIABILITY.value):
            raise HTTPException(400, "account_kind must be 'asset' or 'liability'")
        a.account_kind = payload.account_kind
    sync_account_ledger(db, a)
    db.commit()
    db.refresh(a)
    return _out(db, a)


@router.post("/backfill")
def backfill_bank_accounts(
    only_missing: bool = True,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Link import batches / transactions to bank accounts from stored statements."""
    rep = backfill_profile(db, profile_id, only_missing=only_missing)
    return {
        "batches": rep.batches,
        "linked": rep.linked,
        "by_source": rep.by_source,
        "transactions_linked": rep.transactions_linked,
        "accounts": rep.accounts,
        "warnings": rep.warnings[:200],
    }
