"""Derived double-entry journal for a profile.

Every bank transaction becomes a balanced journal entry:

    bank ledger   Dr/Cr  amount            (the real account the line hit)
    category      Cr/Dr  amount            (the ledger the user categorised it to)

plus engine entries:

* **opening**     — earliest statement's printed opening balance vs
                    *Opening Balance Equity*
* **transfer pair** — own-account transfers between two tracked accounts
                    (both legs categorised to a ``transfer`` ledger, same
                    amount, opposite sign, within ``PAIR_WINDOW_DAYS``) post
                    bank ↔ *Inter-account Transfers in Transit* on each leg's
                    own date, so the pair nets to 0.00 and never touches the
                    transfer category ledgers. Unpaired legs stay in their
                    ``transfer`` ledger, which acts as the clearing account.
* **continuity**  — if a statement's printed opening differs from the ledger
                    balance carried forward (missing / overlapping statement)
                    the difference is posted to *Bank Reconciliation Suspense*
                    so bank ledgers keep matching the bank, and the gap is
                    reported on the bank reconciliation.

The journal is derived on demand from transactions (no stored postings), so
re-categorising a transaction immediately flows into every report. Amounts in
postings are signed **debit-positive** (credit = negative); every entry sums
to exactly 0.00, hence every trial balance balances to the cent.
"""

from __future__ import annotations

from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    BankAccount,
    ImportBatch,
    Ledger,
    LedgerSystemRole,
    LedgerType,
    Transaction,
)

ZERO = Decimal("0.00")
CENT = Decimal("0.01")
PAIR_WINDOW_DAYS = 4

# Ledger reporting classes
CLS_BANK = "bank"
CLS_CLEARING = "clearing"
CLS_CAPITAL = "capital"
CLS_EQUITY = "equity"
CLS_DRAWINGS = "drawings"
CLS_INCOME = "income"
CLS_EXPENSE = "expense"
CLS_ASSET = "asset"
CLS_LIABILITY = "liability"

TEMPORARY_CLASSES = {CLS_INCOME, CLS_EXPENSE, CLS_DRAWINGS}


def _d(v) -> Decimal:
    if v is None:
        return ZERO
    return Decimal(str(v)).quantize(CENT)


@dataclass
class LedgerInfo:
    id: int
    name: str
    type: str
    system_role: Optional[str]
    sort_order: int
    cls: str
    bank_account_id: Optional[int] = None


@dataclass
class AccountInfo:
    id: int
    name: str
    account_number: str
    kind: str
    ledger_id: int
    opening_balance: Decimal
    opening_date: Optional[date]
    opening_source: Optional[str]
    bank_name: Optional[str]
    product: Optional[str]


@dataclass
class Posting:
    date: date
    ledger_id: int
    amount: Decimal  # debit-positive
    entry_id: int


@dataclass
class Entry:
    id: int
    date: date
    kind: str  # opening | bank_tx | transfer_leg | continuity
    description: str
    postings: list[tuple[int, Decimal]]
    tx_id: Optional[int] = None
    bank_account_id: Optional[int] = None
    batch_id: Optional[int] = None
    source_file: Optional[str] = None
    category_ledger_id: Optional[int] = None
    pair_id: Optional[int] = None


@dataclass
class TxRow:
    id: int
    date: date
    description: str
    amount: Decimal
    ledger_id: Optional[int]
    categorised: bool
    bank_account_id: Optional[int]
    batch_id: Optional[int]
    source_file: Optional[str]


@dataclass
class TransferPair:
    id: int
    out_tx: int
    in_tx: int
    amount: Decimal
    out_account_id: int
    in_account_id: int
    out_date: date
    in_date: date


@dataclass
class StatementRec:
    account_id: int
    batch_id: int
    filename: str
    period_start: Optional[date]
    period_end: Optional[date]
    printed_opening: Optional[Decimal]
    printed_closing: Optional[Decimal]
    ledger_opening: Decimal  # balance carried forward before any continuity adjustment
    continuity_adjustment: Decimal
    movement: Decimal
    tx_count: int
    ledger_closing: Decimal
    overlaps_previous: bool = False

    @property
    def closing_difference(self) -> Optional[Decimal]:
        if self.printed_closing is None:
            return None
        return _d(self.ledger_closing - self.printed_closing)

    @property
    def opening_difference(self) -> Optional[Decimal]:
        if self.printed_opening is None:
            return None
        return _d(self.printed_opening - self.ledger_opening)

    @property
    def status(self) -> str:
        if self.printed_closing is None:
            return "no_printed_balance"
        if abs(self.closing_difference or ZERO) > Decimal("0.005"):
            return "difference"
        if abs(self.continuity_adjustment) > Decimal("0.005"):
            return "matched_after_gap_adjustment"
        return "matched"


@dataclass
class PairingStats:
    transfer_legs: int = 0
    transfer_legs_amount: Decimal = ZERO
    paired_legs: int = 0
    paired_amount: Decimal = ZERO
    pairs: int = 0
    unpaired_legs: int = 0
    unpaired_amount: Decimal = ZERO
    cross_type_candidates: int = 0
    cross_type_examples: list[dict] = field(default_factory=list)
    unpaired_by_ledger: dict[int, dict] = field(default_factory=dict)

    @property
    def coverage_pct_count(self) -> Decimal:
        if not self.transfer_legs:
            return ZERO
        return (Decimal(self.paired_legs) * 100 / Decimal(self.transfer_legs)).quantize(CENT)

    @property
    def coverage_pct_amount(self) -> Decimal:
        if not self.transfer_legs_amount:
            return ZERO
        return (self.paired_amount * 100 / self.transfer_legs_amount).quantize(CENT)


@dataclass
class Books:
    user_profile_id: int
    ledgers: dict[int, LedgerInfo]
    accounts: dict[int, AccountInfo]
    roles: dict[str, int]
    entries: list[Entry]
    postings: list[Posting]  # sorted by date
    pairs: list[TransferPair]
    pairing: PairingStats
    statements: list[StatementRec]
    tx_count: int

    # ── aggregation ─────────────────────────────────────────────────────────
    def _dates(self) -> list[date]:
        if not hasattr(self, "_date_cache"):
            self._date_cache = [p.date for p in self.postings]  # type: ignore[attr-defined]
        return self._date_cache  # type: ignore[attr-defined]

    def balances(self, d_from: Optional[date] = None, d_to: Optional[date] = None) -> dict[int, Decimal]:
        """Sum of debit-positive postings per ledger with d_from <= date <= d_to."""
        dates = self._dates()
        lo = 0 if d_from is None else bisect_right(dates, d_from - timedelta(days=1))
        hi = len(dates) if d_to is None else bisect_right(dates, d_to)
        out: dict[int, Decimal] = defaultdict(lambda: ZERO)
        for p in self.postings[lo:hi]:
            out[p.ledger_id] += p.amount
        return dict(out)

    def first_date(self) -> Optional[date]:
        return self.postings[0].date if self.postings else None

    def last_date(self) -> Optional[date]:
        return self.postings[-1].date if self.postings else None

    def postings_for(self, ledger_id: int, d_from: Optional[date], d_to: Optional[date]) -> list[Posting]:
        dates = self._dates()
        lo = 0 if d_from is None else bisect_right(dates, d_from - timedelta(days=1))
        hi = len(dates) if d_to is None else bisect_right(dates, d_to)
        return [p for p in self.postings[lo:hi] if p.ledger_id == ledger_id]

    def entry(self, entry_id: int) -> Entry:
        return self.entries[entry_id]


def classify_ledger(lg: Ledger) -> str:
    role = lg.system_role
    if role == LedgerSystemRole.BANK_ACCOUNT.value:
        return CLS_BANK
    if role in (
        LedgerSystemRole.TRANSFER_IN_TRANSIT.value,
        LedgerSystemRole.BANK_REC_SUSPENSE.value,
        LedgerSystemRole.UNCATEGORISED.value,
    ):
        return CLS_CLEARING
    if role in (
        LedgerSystemRole.OPENING_EQUITY.value,
        LedgerSystemRole.RETAINED_EARNINGS.value,
        LedgerSystemRole.DRAWINGS_BF.value,
    ):
        return CLS_EQUITY
    t = (lg.type or "").lower()
    if t == LedgerType.INCOME.value:
        return CLS_INCOME
    if t == LedgerType.EXPENSE.value:
        return CLS_EXPENSE
    if t == LedgerType.TRANSFER.value:
        return CLS_CLEARING
    if t == LedgerType.CAPITAL.value:
        return CLS_CAPITAL
    if t == LedgerType.EQUITY.value:
        return CLS_EQUITY
    if t == LedgerType.ASSET.value:
        return CLS_ASSET
    if t == LedgerType.LIABILITY.value:
        return CLS_LIABILITY
    # "other": drawings, personal, income tax, cash withdrawals → owner's drawings
    return CLS_DRAWINGS


def _ensure_linked(db: Session, user_profile_id: int) -> None:
    """Self-heal: link any transactions still missing a bank account."""
    from app.services.bank_accounts import backfill_profile, ensure_system_ledgers

    missing = (
        db.query(Transaction.id)
        .filter(
            Transaction.user_profile_id == user_profile_id,
            Transaction.bank_account_id.is_(None),
        )
        .first()
    )
    if missing is not None:
        backfill_profile(db, user_profile_id)
        return
    roles = {
        r
        for (r,) in db.query(Ledger.system_role)
        .filter(Ledger.user_profile_id == user_profile_id, Ledger.system_role.isnot(None))
        .all()
    }
    from app.services.bank_accounts import SYSTEM_LEDGERS

    if not set(SYSTEM_LEDGERS).issubset(roles):
        ensure_system_ledgers(db, user_profile_id)
        db.commit()


def pair_transfers(
    txs: list[TxRow],
    ledgers: dict[int, LedgerInfo],
    window_days: int = PAIR_WINDOW_DAYS,
) -> tuple[list[TransferPair], PairingStats]:
    stats = PairingStats()
    legs = [
        t
        for t in txs
        if t.categorised
        and t.ledger_id in ledgers
        and ledgers[t.ledger_id].type == LedgerType.TRANSFER.value
        and t.bank_account_id is not None
        and t.amount != 0
    ]
    stats.transfer_legs = len(legs)
    stats.transfer_legs_amount = sum((abs(t.amount) for t in legs), ZERO)
    by_amt: dict[Decimal, list[TxRow]] = defaultdict(list)
    for t in legs:
        by_amt[abs(t.amount)].append(t)
    cands: list[tuple[int, date, int, int, TxRow, TxRow]] = []
    for group in by_amt.values():
        outs = [t for t in group if t.amount < 0]
        ins = [t for t in group if t.amount > 0]
        if not outs or not ins:
            continue
        for o in outs:
            for i in ins:
                if o.bank_account_id == i.bank_account_id:
                    continue
                gap = abs((i.date - o.date).days)
                if gap <= window_days:
                    cands.append((gap, o.date, o.id, i.id, o, i))
    cands.sort(key=lambda c: c[:4])
    used: set[int] = set()
    pairs: list[TransferPair] = []
    for _gap, _d0, oid, iid, o, i in cands:
        if oid in used or iid in used:
            continue
        used.add(oid)
        used.add(iid)
        pairs.append(
            TransferPair(
                id=len(pairs),
                out_tx=oid,
                in_tx=iid,
                amount=abs(o.amount),
                out_account_id=o.bank_account_id,  # type: ignore[arg-type]
                in_account_id=i.bank_account_id,  # type: ignore[arg-type]
                out_date=o.date,
                in_date=i.date,
            )
        )
    stats.pairs = len(pairs)
    stats.paired_legs = 2 * len(pairs)
    stats.paired_amount = sum((p.amount * 2 for p in pairs), ZERO)
    unpaired = [t for t in legs if t.id not in used]
    stats.unpaired_legs = len(unpaired)
    stats.unpaired_amount = sum((abs(t.amount) for t in unpaired), ZERO)
    for t in unpaired:
        row = stats.unpaired_by_ledger.setdefault(
            t.ledger_id, {"count": 0, "amount": ZERO, "net": ZERO}  # type: ignore[arg-type]
        )
        row["count"] += 1
        row["amount"] += abs(t.amount)
        row["net"] += t.amount

    # Diagnostic: unpaired transfer legs whose mirror exists on another tracked
    # account but is categorised to a non-transfer ledger (needs a decision —
    # pairing them would move amounts out of income/expense).
    others: dict[Decimal, list[TxRow]] = defaultdict(list)
    for t in txs:
        if t.bank_account_id is None or t.amount == 0 or t.id in used:
            continue
        lg = ledgers.get(t.ledger_id) if t.ledger_id else None
        if lg is not None and lg.type == LedgerType.TRANSFER.value:
            continue
        others[abs(t.amount)].append(t)
    taken: set[int] = set()
    combos: dict[tuple[str, str], dict] = {}
    for t in sorted(unpaired, key=lambda x: (x.date, x.id)):
        best = None
        for o in others.get(abs(t.amount), []):
            if o.id in taken or o.bank_account_id == t.bank_account_id:
                continue
            if (o.amount > 0) == (t.amount > 0):
                continue
            gap = abs((o.date - t.date).days)
            if gap <= window_days and (best is None or gap < best[0]):
                best = (gap, o)
        if best is None:
            continue
        o = best[1]
        taken.add(o.id)
        stats.cross_type_candidates += 1
        other_name = ledgers[o.ledger_id].name if o.ledger_id in ledgers else "(uncategorised)"
        key = (ledgers[t.ledger_id].name, other_name)  # type: ignore[index]
        c = combos.setdefault(key, {"transfer_ledger": key[0], "other_ledger": key[1], "count": 0, "amount": ZERO})
        c["count"] += 1
        c["amount"] += abs(t.amount)
    stats.cross_type_examples = sorted(combos.values(), key=lambda c: -c["amount"])
    return pairs, stats


def build_books(db: Session, user_profile_id: int, *, pair_window_days: int = PAIR_WINDOW_DAYS) -> Books:
    _ensure_linked(db, user_profile_id)

    ledger_rows = db.query(Ledger).filter(Ledger.user_profile_id == user_profile_id).all()
    ledgers: dict[int, LedgerInfo] = {}
    roles: dict[str, int] = {}
    for lg in ledger_rows:
        ledgers[lg.id] = LedgerInfo(
            id=lg.id,
            name=lg.name,
            type=lg.type,
            system_role=lg.system_role,
            sort_order=lg.sort_order or 0,
            cls=classify_ledger(lg),
        )
        if lg.system_role and lg.system_role != LedgerSystemRole.BANK_ACCOUNT.value:
            roles.setdefault(lg.system_role, lg.id)

    accounts: dict[int, AccountInfo] = {}
    for a in db.query(BankAccount).filter(BankAccount.user_profile_id == user_profile_id).all():
        if a.ledger_id is None or a.ledger_id not in ledgers:
            continue
        accounts[a.id] = AccountInfo(
            id=a.id,
            name=a.name,
            account_number=a.account_number,
            kind=a.account_kind,
            ledger_id=a.ledger_id,
            opening_balance=_d(a.opening_balance),
            opening_date=a.opening_date,
            opening_source=a.opening_source,
            bank_name=a.bank_name,
            product=a.product,
        )
        ledgers[a.ledger_id].bank_account_id = a.id

    rows = (
        db.query(
            Transaction.id,
            Transaction.date,
            Transaction.description,
            Transaction.amount,
            Transaction.ledger_id,
            Transaction.is_categorised,
            Transaction.bank_account_id,
            Transaction.import_batch_id,
            Transaction.source_file,
        )
        .filter(
            Transaction.user_profile_id == user_profile_id,
            Transaction.is_excluded.is_(False),
        )
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    txs = [
        TxRow(
            id=r[0],
            date=r[1],
            description=r[2] or "",
            amount=_d(r[3]),
            ledger_id=r[4],
            categorised=bool(r[5]) and r[4] is not None and r[4] in ledgers,
            bank_account_id=r[6] if r[6] in accounts else None,
            batch_id=r[7],
            source_file=r[8],
        )
        for r in rows
    ]

    pairs, pairing = pair_transfers(txs, ledgers, pair_window_days)
    pair_of: dict[int, TransferPair] = {}
    for p in pairs:
        pair_of[p.out_tx] = p
        pair_of[p.in_tx] = p

    entries: list[Entry] = []

    def add(e: Entry) -> None:
        e.id = len(entries)
        assert sum((a for _, a in e.postings), ZERO) == 0, e
        entries.append(e)

    in_transit = roles[LedgerSystemRole.TRANSFER_IN_TRANSIT.value]
    suspense = roles[LedgerSystemRole.BANK_REC_SUSPENSE.value]
    uncategorised = roles[LedgerSystemRole.UNCATEGORISED.value]
    opening_equity = roles[LedgerSystemRole.OPENING_EQUITY.value]

    # Statement continuity per account (batch based) + opening balances
    batches = (
        db.query(ImportBatch)
        .filter(ImportBatch.user_profile_id == user_profile_id, ImportBatch.bank_account_id.isnot(None))
        .all()
    )
    batch_sum: dict[int, Decimal] = defaultdict(lambda: ZERO)
    batch_cnt: dict[int, int] = defaultdict(int)
    batch_min: dict[int, date] = {}
    for t in txs:
        if t.batch_id is None:
            continue
        batch_sum[t.batch_id] += t.amount
        batch_cnt[t.batch_id] += 1
        if t.batch_id not in batch_min or t.date < batch_min[t.batch_id]:
            batch_min[t.batch_id] = t.date
    by_acct: dict[int, list[ImportBatch]] = defaultdict(list)
    for b in batches:
        if b.bank_account_id in accounts:
            by_acct[b.bank_account_id].append(b)

    statements: list[StatementRec] = []
    for acct_id, acct in accounts.items():
        stmts = sorted(
            by_acct.get(acct_id, []),
            key=lambda b: (b.period_start or batch_min.get(b.id) or date.max, b.period_end or date.max, b.id),
        )
        # Opening: printed opening of the earliest statement that has one, rolled
        # back over any earlier statements without printed balances.
        opening = acct.opening_balance
        before = ZERO
        for b in stmts:
            if b.statement_opening is not None:
                opening = _d(b.statement_opening)
                break
            before += batch_sum.get(b.id, ZERO)
        opening = _d(opening - before)
        first_dates = [d for d in [acct.opening_date] + [batch_min.get(b.id) for b in stmts[:1]] + [stmts[0].period_start if stmts else None] if d]
        tx_dates = [t.date for t in txs if t.bank_account_id == acct_id][:1]
        open_date = min(first_dates + tx_dates) if (first_dates or tx_dates) else None
        if opening != 0 and open_date is not None:
            add(
                Entry(
                    id=0,
                    date=open_date,
                    kind="opening",
                    description=f"Opening balance – {acct.name} ({acct.opening_source or 'earliest statement'})",
                    postings=[(acct.ledger_id, opening), (opening_equity, -opening)],
                    bank_account_id=acct_id,
                )
            )
        running = opening
        prev_end: Optional[date] = None
        seen_printed = False
        for b in stmts:
            ledger_open = running
            adj = ZERO
            if b.statement_opening is not None:
                if seen_printed:
                    adj = _d(_d(b.statement_opening) - running)
                seen_printed = True
            if adj != 0:
                adj_date = min(d for d in (b.period_start, batch_min.get(b.id)) if d) if (b.period_start or batch_min.get(b.id)) else (prev_end or date.today())
                add(
                    Entry(
                        id=0,
                        date=adj_date,
                        kind="continuity",
                        description=(
                            f"Statement continuity difference – {acct.name}: printed opening "
                            f"{_d(b.statement_opening)} vs ledger {ledger_open} ({b.filename})"
                        ),
                        postings=[(acct.ledger_id, adj), (suspense, -adj)],
                        bank_account_id=acct_id,
                        batch_id=b.id,
                        source_file=b.filename,
                    )
                )
                running += adj
            mv = _d(batch_sum.get(b.id, ZERO))
            running = _d(running + mv)
            statements.append(
                StatementRec(
                    account_id=acct_id,
                    batch_id=b.id,
                    filename=b.filename,
                    period_start=b.period_start,
                    period_end=b.period_end,
                    printed_opening=_d(b.statement_opening) if b.statement_opening is not None else None,
                    printed_closing=_d(b.statement_closing) if b.statement_closing is not None else None,
                    ledger_opening=ledger_open,
                    continuity_adjustment=adj,
                    movement=mv,
                    tx_count=batch_cnt.get(b.id, 0),
                    ledger_closing=running,
                    overlaps_previous=bool(prev_end and b.period_start and b.period_start < prev_end),
                )
            )
            if b.period_end:
                prev_end = b.period_end if prev_end is None else max(prev_end, b.period_end)

    # Bank transactions
    acct_ledger = {a.id: a.ledger_id for a in accounts.values()}
    acct_name = {a.id: a.name for a in accounts.values()}
    for t in txs:
        if t.bank_account_id is None:
            continue  # cannot post without a bank side (should not happen after backfill)
        bank_lg = acct_ledger[t.bank_account_id]
        p = pair_of.get(t.id)
        if p is not None:
            other = p.in_account_id if t.id == p.out_tx else p.out_account_id
            add(
                Entry(
                    id=0,
                    date=t.date,
                    kind="transfer_leg",
                    description=f"{t.description} ⇄ {acct_name.get(other, 'other account')}",
                    postings=[(bank_lg, t.amount), (in_transit, -t.amount)],
                    tx_id=t.id,
                    bank_account_id=t.bank_account_id,
                    batch_id=t.batch_id,
                    source_file=t.source_file,
                    category_ledger_id=t.ledger_id,
                    pair_id=p.id,
                )
            )
            continue
        cat = t.ledger_id if t.categorised else uncategorised
        add(
            Entry(
                id=0,
                date=t.date,
                kind="bank_tx",
                description=t.description,
                postings=[(bank_lg, t.amount), (cat, -t.amount)],  # type: ignore[list-item]
                tx_id=t.id,
                bank_account_id=t.bank_account_id,
                batch_id=t.batch_id,
                source_file=t.source_file,
                category_ledger_id=cat,
            )
        )

    postings = [
        Posting(date=e.date, ledger_id=lid, amount=amt, entry_id=e.id)
        for e in entries
        for lid, amt in e.postings
        if amt != 0
    ]
    postings.sort(key=lambda p: (p.date, p.entry_id))
    return Books(
        user_profile_id=user_profile_id,
        ledgers=ledgers,
        accounts=accounts,
        roles=roles,
        entries=entries,
        postings=postings,
        pairs=pairs,
        pairing=pairing,
        statements=statements,
        tx_count=len(txs),
    )
