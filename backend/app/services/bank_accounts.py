"""Bank accounts as asset / liability ledgers (double-entry bank side).

Every transaction belongs to exactly one *real* account (identified by the
statement's account number), independent of the BankProfile (parser
calibration) used to import it. This module:

* creates the engine-owned system ledgers for a profile
  (Opening Balance Equity, Retained Earnings, transfers in transit, suspense…)
* creates one BankAccount + ledger per real account (``asset`` or ``liability``)
* links import batches / transactions to accounts from statement metadata
* backfills existing data (re-reads the stored upload / corpus PDF header,
  falls back to the file name and running balances)
* derives each account's opening balance from its earliest statement
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    BankAccount,
    BankProfile,
    ImportBatch,
    Ledger,
    LedgerSystemRole,
    LedgerType,
    Transaction,
)
from app.services.statement_meta import (
    StatementMeta,
    account_number_from_filename,
    meta_from_path,
)

ZERO = Decimal("0.00")

# role → (name, type, sort_order)
SYSTEM_LEDGERS: dict[str, tuple[str, str, int]] = {
    LedgerSystemRole.OPENING_EQUITY.value: ("Opening Balance Equity", LedgerType.EQUITY.value, 950),
    LedgerSystemRole.RETAINED_EARNINGS.value: (
        "Retained Earnings (accumulated net result)",
        LedgerType.EQUITY.value,
        951,
    ),
    LedgerSystemRole.DRAWINGS_BF.value: (
        "Owner's Drawings b/f (prior years)",
        LedgerType.EQUITY.value,
        952,
    ),
    LedgerSystemRole.TRANSFER_IN_TRANSIT.value: (
        "Inter-account Transfers in Transit",
        LedgerType.ASSET.value,
        940,
    ),
    LedgerSystemRole.BANK_REC_SUSPENSE.value: (
        "Bank Reconciliation Suspense (statement gaps / overlaps)",
        LedgerType.ASSET.value,
        941,
    ),
    LedgerSystemRole.UNCATEGORISED.value: (
        "Uncategorised Transactions (suspense)",
        LedgerType.ASSET.value,
        942,
    ),
}


def ensure_system_ledgers(db: Session, user_profile_id: int) -> dict[str, Ledger]:
    existing = {
        lg.system_role: lg
        for lg in db.query(Ledger)
        .filter(Ledger.user_profile_id == user_profile_id, Ledger.system_role.isnot(None))
        .all()
        if lg.system_role != LedgerSystemRole.BANK_ACCOUNT.value
    }
    for role, (name, ltype, sort) in SYSTEM_LEDGERS.items():
        if role in existing:
            continue
        lg = Ledger(
            user_profile_id=user_profile_id,
            name=name,
            type=ltype,
            is_system=True,
            is_archived=False,
            sort_order=sort,
            system_role=role,
        )
        db.add(lg)
        db.flush()
        existing[role] = lg
    return existing


def _bank_name(bank_profile: Optional[BankProfile], meta: Optional[StatementMeta]) -> Optional[str]:
    if meta and meta.bank:
        return meta.bank
    if bank_profile is not None:
        return bank_profile.bank_type or bank_profile.name
    return None


def _default_name(bank_name: Optional[str], product: Optional[str], number: str) -> str:
    prod = (product or "Account").strip()
    bank = (bank_name or "").strip()
    if bank and not prod.lower().startswith(bank.lower()):
        prod = f"{bank} {prod}"
    return f"{prod} {number}"


def _ledger_name(acct: BankAccount) -> str:
    prefix = "Loan" if acct.account_kind == LedgerType.LIABILITY.value else "Bank"
    return f"{prefix}: {acct.name}"[:200]


def sync_account_ledger(db: Session, acct: BankAccount) -> Ledger:
    lg = db.get(Ledger, acct.ledger_id) if acct.ledger_id else None
    want_type = (
        LedgerType.LIABILITY.value
        if acct.account_kind == LedgerType.LIABILITY.value
        else LedgerType.ASSET.value
    )
    if lg is None:
        lg = Ledger(
            user_profile_id=acct.user_profile_id,
            name=_ledger_name(acct),
            type=want_type,
            is_system=True,
            is_archived=False,
            sort_order=900,
            system_role=LedgerSystemRole.BANK_ACCOUNT.value,
        )
        db.add(lg)
        db.flush()
        acct.ledger_id = lg.id
    else:
        lg.name = _ledger_name(acct)
        lg.type = want_type
        lg.system_role = LedgerSystemRole.BANK_ACCOUNT.value
        lg.is_system = True
    return lg


def get_or_create_account(
    db: Session,
    user_profile_id: int,
    account_number: str,
    *,
    bank_profile: Optional[BankProfile] = None,
    meta: Optional[StatementMeta] = None,
) -> BankAccount:
    acct = (
        db.query(BankAccount)
        .filter(
            BankAccount.user_profile_id == user_profile_id,
            BankAccount.account_number == account_number,
        )
        .first()
    )
    if acct is None:
        bank = _bank_name(bank_profile, meta)
        product = meta.product if meta else None
        is_loan = bool(meta and meta.is_loan)
        acct = BankAccount(
            user_profile_id=user_profile_id,
            bank_profile_id=bank_profile.id if bank_profile else None,
            account_number=account_number,
            bank_name=bank,
            product=product,
            name=_default_name(bank, product, account_number),
            account_kind=LedgerType.LIABILITY.value if is_loan else LedgerType.ASSET.value,
            is_active=True,
        )
        db.add(acct)
        db.flush()
    else:
        if meta and meta.product and not acct.product:
            acct.product = meta.product
        if meta and meta.is_loan and acct.account_kind != LedgerType.LIABILITY.value:
            acct.account_kind = LedgerType.LIABILITY.value
    sync_account_ledger(db, acct)
    return acct


def _running_balance_meta(rows: list[tuple[Decimal, Optional[Decimal]]]) -> Optional[tuple[Decimal, Decimal]]:
    """(amount, balance) rows in statement order → (opening, closing) if the chain holds."""
    if not rows or any(b is None for _, b in rows):
        return None
    for seq in (rows, list(reversed(rows))):
        opening = Decimal(str(seq[0][1])) - Decimal(str(seq[0][0]))
        prev = opening
        ok = True
        for amt, bal in seq:
            if abs(prev + Decimal(str(amt)) - Decimal(str(bal))) > Decimal("0.01"):
                ok = False
                break
            prev = Decimal(str(bal))
        if ok:
            return opening, prev
    return None


def apply_meta_to_batch(
    db: Session,
    batch: ImportBatch,
    meta: Optional[StatementMeta],
    *,
    meta_source: Optional[str],
    bank_profile: Optional[BankProfile] = None,
) -> Optional[BankAccount]:
    """Attach statement metadata + bank account to a batch and its transactions."""
    bank_profile = bank_profile or (db.get(BankProfile, batch.bank_profile_id) if batch.bank_profile_id else None)
    meta = meta or StatementMeta()
    number = meta.account_number or account_number_from_filename(batch.filename)
    source = meta_source if meta.account_number else ("filename" if number else None)

    if meta.opening is None or meta.closing is None:
        rows = [
            (a, b)
            for a, b in db.query(Transaction.amount, Transaction.balance)
            .filter(Transaction.import_batch_id == batch.id)
            .order_by(Transaction.id)
            .all()
        ]
        rb = _running_balance_meta(rows)
        if rb is not None:
            meta.opening, meta.closing = rb
            source = (source or "") + ("+" if source else "") + "running_balance"

    if not number:
        # Fall back to the single known account for this bank profile, else a
        # per-bank-profile placeholder account (user can re-assign later).
        q = db.query(BankAccount).filter(
            BankAccount.user_profile_id == batch.user_profile_id,
            BankAccount.bank_profile_id == batch.bank_profile_id,
        )
        known = q.all()
        if len(known) == 1:
            number = known[0].account_number
            source = (source or "") + ("+" if source else "") + "bank_profile_single_account"
        else:
            number = f"BP{batch.bank_profile_id}"
            source = (source or "") + ("+" if source else "") + "bank_profile_default"

    acct = get_or_create_account(
        db, batch.user_profile_id, number, bank_profile=bank_profile, meta=meta
    )
    batch.bank_account_id = acct.id
    batch.account_number = number
    batch.statement_opening = meta.opening
    batch.statement_closing = meta.closing
    batch.period_start = meta.period_start
    batch.period_end = meta.period_end
    batch.meta_source = source
    db.query(Transaction).filter(Transaction.import_batch_id == batch.id).update(
        {Transaction.bank_account_id: acct.id}, synchronize_session=False
    )
    return acct


def _batch_sort_key(b: ImportBatch, first_tx: dict[int, date]) -> tuple:
    start = b.period_start or first_tx.get(b.id) or date.max
    end = b.period_end or start
    return (start, end, b.id)


def statements_for_account(db: Session, acct: BankAccount) -> list[ImportBatch]:
    batches = (
        db.query(ImportBatch)
        .filter(ImportBatch.bank_account_id == acct.id)
        .all()
    )
    first_tx = dict(
        db.query(Transaction.import_batch_id, func.min(Transaction.date))
        .filter(Transaction.bank_account_id == acct.id)
        .group_by(Transaction.import_batch_id)
        .all()
    )
    return sorted(batches, key=lambda b: _batch_sort_key(b, first_tx))


def refresh_openings(db: Session, user_profile_id: int) -> None:
    """Opening balance per account = printed opening of its earliest statement."""
    for acct in db.query(BankAccount).filter(BankAccount.user_profile_id == user_profile_id).all():
        stmts = statements_for_account(db, acct)
        first = next((b for b in stmts if b.statement_opening is not None), None)
        if first is None:
            acct.opening_balance = ZERO
            acct.opening_date = None
            acct.opening_source = "no printed balance found — opening assumed 0.00"
            continue
        min_tx = (
            db.query(func.min(Transaction.date))
            .filter(Transaction.import_batch_id == first.id)
            .scalar()
        )
        candidates = [d for d in (first.period_start, min_tx) if d is not None]
        acct.opening_balance = first.statement_opening
        acct.opening_date = min(candidates) if candidates else None
        acct.opening_source = first.filename
        sync_account_ledger(db, acct)


# ── Backfill ────────────────────────────────────────────────────────────────


@dataclass
class BackfillReport:
    batches: int = 0
    linked: int = 0
    by_source: dict[str, int] = field(default_factory=dict)
    transactions_linked: int = 0
    accounts: int = 0
    warnings: list[str] = field(default_factory=list)


def _upload_index(uploads_dir: Path) -> list[tuple[float, Path]]:
    if not uploads_dir.is_dir():
        return []
    return [(p.stat().st_mtime, p) for p in uploads_dir.iterdir() if p.is_file()]


def _match_upload(batch: ImportBatch, index: list[tuple[float, Path]]) -> Optional[Path]:
    if not index or batch.uploaded_at is None:
        return None
    ts = batch.uploaded_at.replace(tzinfo=timezone.utc).timestamp()
    delta, path = min(((abs(m - ts), p) for m, p in index), key=lambda x: x[0])
    return path if delta <= 5.0 else None


def _corpus_index(corpus_dirs: Iterable[Path]) -> dict[str, list[Path]]:
    idx: dict[str, list[Path]] = {}
    for d in corpus_dirs:
        if d and Path(d).is_dir():
            for p in Path(d).rglob("*"):
                if p.is_file():
                    idx.setdefault(p.name, []).append(p)
    return idx


def backfill_profile(
    db: Session,
    user_profile_id: int,
    *,
    uploads_dir: Optional[Path] = None,
    corpus_dirs: Iterable[Path] = (),
    only_missing: bool = True,
) -> BackfillReport:
    """Link every import batch / transaction of a profile to its bank account."""
    from app.config import UPLOADS_DIR

    rep = BackfillReport()
    ensure_system_ledgers(db, user_profile_id)
    up_index = _upload_index(Path(uploads_dir or UPLOADS_DIR))
    corpus = _corpus_index(corpus_dirs)
    q = db.query(ImportBatch).filter(ImportBatch.user_profile_id == user_profile_id)
    if only_missing:
        q = q.filter(ImportBatch.bank_account_id.is_(None))
    batches = q.order_by(ImportBatch.id).all()
    rep.batches = len(batches)
    for b in batches:
        bp = db.get(BankProfile, b.bank_profile_id) if b.bank_profile_id else None
        hint = bp.bank_type if bp else None
        meta: Optional[StatementMeta] = None
        src = None
        candidates: list[tuple[str, Path]] = []
        if b.source_upload:
            from app.config import UPLOADS_DIR as _UP

            candidates.append(("pdf_header", Path(_UP) / b.source_upload))
        m_up = _match_upload(b, up_index)
        if m_up is not None:
            candidates.append(("pdf_header", m_up))
        for p in corpus.get(Path(b.filename).name, []):
            candidates.append(("pdf_header_corpus", p))
        fn_number = account_number_from_filename(b.filename)
        for label, path in candidates:
            if not path.is_file():
                continue
            m = meta_from_path(path, hint)
            if not m.account_number:
                continue
            if fn_number and m.account_number != fn_number:
                rep.warnings.append(
                    f"batch {b.id} {b.filename!r}: header account {m.account_number} != filename {fn_number}; skipped {path.name}"
                )
                continue
            meta, src = m, label
            if label == "pdf_header" and not b.source_upload and path.parent == Path(uploads_dir or UPLOADS_DIR):
                b.source_upload = path.name
            break
        if meta is None:
            rep.warnings.append(f"batch {b.id} {b.filename!r}: no readable statement header; using fallbacks")
        apply_meta_to_batch(db, b, meta, meta_source=src, bank_profile=bp)
        rep.linked += 1
        key = b.meta_source or "none"
        rep.by_source[key] = rep.by_source.get(key, 0) + 1
    db.flush()
    # Orphan transactions without a batch: assign per bank profile default account
    orphans = (
        db.query(Transaction)
        .filter(
            Transaction.user_profile_id == user_profile_id,
            Transaction.bank_account_id.is_(None),
        )
        .all()
    )
    for t in orphans:
        number = account_number_from_filename(t.source_file or "") or f"BP{t.bank_profile_id}"
        bp = db.get(BankProfile, t.bank_profile_id) if t.bank_profile_id else None
        acct = get_or_create_account(db, user_profile_id, number, bank_profile=bp)
        t.bank_account_id = acct.id
    if orphans:
        rep.warnings.append(f"{len(orphans)} transaction(s) without import batch assigned by file name / bank profile")
    refresh_openings(db, user_profile_id)
    db.commit()
    rep.transactions_linked = (
        db.query(Transaction)
        .filter(Transaction.user_profile_id == user_profile_id, Transaction.bank_account_id.isnot(None))
        .count()
    )
    rep.accounts = db.query(BankAccount).filter(BankAccount.user_profile_id == user_profile_id).count()
    return rep
