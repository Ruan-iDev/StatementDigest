"""Capitec Business: auto-assign statement Fees to Bank Charges & Fees ledger.

Only runs when a transaction carries fee_amount (Capitec Business parser).
Does not touch Discovery / FNB rows.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Ledger, LedgerType, Transaction

# Preferred ledger names (first match wins)
_BANK_FEE_LEDGER_NAMES = (
    "Bank Charges & Fees",
    "Bank Fees",
    "Bank Charges",
    "Bank fees",
)

# Reference prefix so fee sibling rows are idempotent / identifiable
FEE_REF_PREFIX = "CAPITEC_FEE:"


def find_bank_fees_ledger(db: Session, user_profile_id: int) -> Optional[Ledger]:
    """Locate the Bank Fees / Bank Charges ledger for this workspace."""
    ledgers = (
        db.query(Ledger)
        .filter(
            Ledger.user_profile_id == user_profile_id,
            Ledger.is_archived.is_(False),
        )
        .all()
    )
    by_lower = { (L.name or "").strip().lower(): L for L in ledgers }
    for name in _BANK_FEE_LEDGER_NAMES:
        hit = by_lower.get(name.lower())
        if hit:
            return hit
    for L in ledgers:
        n = (L.name or "").lower()
        if "bank" in n and ("fee" in n or "charge" in n):
            return L
    return None


def ensure_bank_fees_ledger(db: Session, user_profile_id: int) -> Ledger:
    """Return Bank Charges & Fees ledger, creating it if missing."""
    existing = find_bank_fees_ledger(db, user_profile_id)
    if existing:
        return existing
    led = Ledger(
        user_profile_id=user_profile_id,
        name="Bank Charges & Fees",
        type=LedgerType.EXPENSE.value,
        is_system=True,
        is_archived=False,
        sort_order=110,
    )
    db.add(led)
    db.flush()
    return led


def _fee_decimal(raw) -> Optional[Decimal]:
    if raw is None:
        return None
    try:
        d = Decimal(str(raw))
    except Exception:
        return None
    if d == 0:
        return None
    return d


def _is_fee_sibling(tx: Transaction) -> bool:
    ref = (tx.reference or "")
    return ref.startswith(FEE_REF_PREFIX) or (tx.description or "").startswith("Bank fee ·")


def apply_capitec_fees_to_bank_ledger(
    db: Session,
    transaction_ids: list[int],
) -> int:
    """Auto-assign Capitec fee values to Bank Charges & Fees.

    For every row with fee_amount (including Monthly Service Fee at R0.00 amount):
    keep the statement row for display and create a sibling fee transaction
    booked to Bank Charges & Fees.

    Returns count of fee siblings created.
    """
    if not transaction_ids:
        return 0

    txs = (
        db.query(Transaction)
        .filter(Transaction.id.in_(transaction_ids))
        .all()
    )
    if not txs:
        return 0

    profile_id = txs[0].user_profile_id
    bank_fees = ensure_bank_fees_ledger(db, profile_id)
    assigned = 0

    # Avoid creating duplicate siblings if re-run on same ids
    existing_refs = {
        t.reference
        for t in db.query(Transaction)
        .filter(
            Transaction.user_profile_id == profile_id,
            Transaction.reference.isnot(None),
            Transaction.reference.like(f"{FEE_REF_PREFIX}%"),
        )
        .all()
        if t.reference
    }

    for tx in txs:
        if _is_fee_sibling(tx):
            continue
        fee = _fee_decimal(tx.fee_amount)
        if fee is None:
            continue

        # Always book fee to Bank Charges via sibling — including fee-only rows
        # (Monthly Service Fee: amount R0.00 + fee_amount on parent for display).
        ref_key = f"{FEE_REF_PREFIX}{tx.id}"
        if ref_key in existing_refs:
            continue
        fee_tx = Transaction(
            user_profile_id=tx.user_profile_id,
            bank_profile_id=tx.bank_profile_id,
            date=tx.date,
            description=f"Bank fee · {tx.description}",
            amount=fee,
            fee_amount=None,
            principal_amount=None,
            balance=None,
            reference=ref_key,
            ledger_id=bank_fees.id,
            is_categorised=True,
            rule_id=None,
            notes="Auto-assigned Capitec fee → Bank Charges & Fees",
            source_file=tx.source_file,
            import_batch_id=tx.import_batch_id,
            is_excluded=False,
        )
        db.add(fee_tx)
        db.flush()
        existing_refs.add(ref_key)
        assigned += 1

    if assigned:
        db.commit()
    return assigned
