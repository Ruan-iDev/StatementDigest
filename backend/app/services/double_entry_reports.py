"""Double-entry reports: trial balance, balance sheet, bank reconciliation,
general ledger (incl. bank ledgers) and transfer-pairing coverage.

All built from :func:`app.services.double_entry.build_books` (derived
journal), returned as :class:`SaSupportReport` so the Reporting hub UI and the
generic SA PDF exporter render them without special cases.

Sign convention in JSON: ``amount`` is the **debit-positive** balance
(credit balances negative); ``debit`` / ``credit`` columns are absolute.
Balance-sheet lines show natural-sign amounts (assets positive, liabilities
and equity positive when credit).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import LedgerSystemRole, LedgerType
from app.schemas import (
    FinancialYearOption,
    SaReportLedgerLine,
    SaReportSection,
    SaReportTxnLine,
    SaSupportReport,
)
from app.services.double_entry import (
    CLS_ASSET,
    CLS_BANK,
    CLS_CAPITAL,
    CLS_CLEARING,
    CLS_DRAWINGS,
    CLS_EQUITY,
    CLS_EXPENSE,
    CLS_INCOME,
    CLS_LIABILITY,
    TEMPORARY_CLASSES,
    Books,
    LedgerInfo,
    build_books,
)
from app.services.reports import fy_bounds, profile_pref
from app.services.sa_tax_reports import _base, _q, _resolve_fy_or_period

ZERO = Decimal("0.00")

ALL_TIME = {"all", "all_time", "alltime"}


def _period(
    db: Session,
    books: Books,
    *,
    user_profile_id: int,
    fy_start_year: Optional[int],
    period: str,
    date_from: Optional[date],
    date_to: Optional[date],
    ref: Optional[date],
) -> tuple[date, date, str, int, list[FinancialYearOption]]:
    d_from, d_to, label, fy_month, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=None if (period or "").lower() in ALL_TIME else fy_start_year,
        period="financial_year" if (period or "").lower() in ALL_TIME else period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    if (period or "").lower() in ALL_TIME:
        first = books.first_date() or d_from
        last = books.last_date() or d_to
        return first, last, "All time", fy_month, years
    return d_from, d_to, label, fy_month, years


def _dc(amount: Decimal) -> tuple[Decimal, Decimal]:
    amount = _q(amount)
    return (amount, ZERO) if amount > 0 else (ZERO, _q(-amount))


def _tb_line(lg: LedgerInfo, amount: Decimal, note: Optional[str] = None) -> SaReportLedgerLine:
    debit, credit = _dc(amount)
    return SaReportLedgerLine(
        ledger_id=lg.id,
        ledger_name=lg.name,
        ledger_type=lg.type,
        amount=_q(amount),
        debit=debit,
        credit=credit,
        note=note,
    )


def _sorted_ledgers(books: Books, cls: set[str]) -> list[LedgerInfo]:
    return sorted(
        (lg for lg in books.ledgers.values() if lg.cls in cls),
        key=lambda lg: (lg.sort_order, lg.name.lower()),
    )


def _is_loan_capital(lg: LedgerInfo) -> bool:
    return lg.cls == CLS_CAPITAL and "loan" in lg.name.lower()


# ── Trial balance ───────────────────────────────────────────────────────────


def compute_trial_balance(books: Books, d_from: date, d_to: date) -> dict[str, Any]:
    """Closing TB at d_to: balance-sheet ledgers cumulative, P&L / drawings for
    the period, prior periods rolled into Retained Earnings / Drawings b/f."""
    bal_to = books.balances(None, d_to)
    bal_period = books.balances(d_from, d_to)
    bal_before = books.balances(None, d_from - timedelta(days=1))
    re_bf = sum((v for lid, v in bal_before.items() if books.ledgers[lid].cls in (CLS_INCOME, CLS_EXPENSE)), ZERO)
    dr_bf = sum((v for lid, v in bal_before.items() if books.ledgers[lid].cls == CLS_DRAWINGS), ZERO)
    amounts: dict[int, Decimal] = {}
    for lid, lg in books.ledgers.items():
        amounts[lid] = _q(bal_period.get(lid, ZERO) if lg.cls in TEMPORARY_CLASSES else bal_to.get(lid, ZERO))
    re_id = books.roles[LedgerSystemRole.RETAINED_EARNINGS.value]
    dbf_id = books.roles[LedgerSystemRole.DRAWINGS_BF.value]
    amounts[re_id] = _q(amounts.get(re_id, ZERO) + re_bf)
    amounts[dbf_id] = _q(amounts.get(dbf_id, ZERO) + dr_bf)
    total_debit = sum((a for a in amounts.values() if a > 0), ZERO)
    total_credit = sum((-a for a in amounts.values() if a < 0), ZERO)
    income = -sum((amounts[l.id] for l in books.ledgers.values() if l.cls == CLS_INCOME), ZERO)
    expense = sum((amounts[l.id] for l in books.ledgers.values() if l.cls == CLS_EXPENSE), ZERO)
    return {
        "amounts": amounts,
        "total_debit": _q(total_debit),
        "total_credit": _q(total_credit),
        "difference": _q(total_debit - total_credit),
        "income": _q(income),
        "expenses": _q(expense),
        "net_result": _q(income - expense),
        "retained_earnings_bf": _q(-re_bf),
    }


TB_SECTIONS: list[tuple[str, str, set[str]]] = [
    ("bank", "Bank & loan accounts (assets / liabilities)", {CLS_BANK, CLS_ASSET, CLS_LIABILITY}),
    ("capital", "Capital items", {CLS_CAPITAL}),
    ("clearing", "Transfer clearing, in-transit & suspense", {CLS_CLEARING}),
    ("equity", "Equity", {CLS_EQUITY}),
    ("drawings", "Owner's drawings / personal (period)", {CLS_DRAWINGS}),
    ("income", "Income (period)", {CLS_INCOME}),
    ("expense", "Expenses (period)", {CLS_EXPENSE}),
]


def build_trial_balance(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    books: Optional[Books] = None,
) -> SaSupportReport:
    books = books or build_books(db, user_profile_id)
    d_from, d_to, label, _, years = _period(
        db, books, user_profile_id=user_profile_id, fy_start_year=fy_start_year,
        period=period, date_from=date_from, date_to=date_to, ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    tb = compute_trial_balance(books, d_from, d_to)
    amounts = tb["amounts"]
    sections: list[SaReportSection] = []
    for key, title, classes in TB_SECTIONS:
        lines = []
        for lg in _sorted_ledgers(books, classes):
            amt = amounts.get(lg.id, ZERO)
            if amt == 0 and lg.cls != CLS_BANK:
                continue
            note = None
            if lg.system_role == LedgerSystemRole.RETAINED_EARNINGS.value:
                note = "prior periods' net result b/f"
            elif lg.system_role == LedgerSystemRole.DRAWINGS_BF.value:
                note = "prior periods' drawings b/f"
            elif lg.cls == CLS_CLEARING and lg.type == LedgerType.TRANSFER.value:
                note = "unpaired transfer legs"
            lines.append(_tb_line(lg, amt, note))
        if lines:
            dr = sum((ln.debit for ln in lines), ZERO)
            cr = sum((ln.credit for ln in lines), ZERO)
            sections.append(
                SaReportSection(
                    key=f"tb-{key}", title=title, kind="totals", lines=lines,
                    summary={"debits": str(_q(dr)), "credits": str(_q(cr))},
                )
            )
    return _base(
        report_key="trial-balance",
        title="Trial balance (double-entry)",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Double-entry TB: every bank line posts to its bank/loan ledger and the opposite to its category.",
            f"Balance-sheet ledgers are cumulative to {d_to.isoformat()}; income, expenses and drawings are for the period "
            "(earlier periods roll into Retained Earnings / Drawings b/f).",
            "Opening balances come from each account's earliest printed statement balance (vs Opening Balance Equity).",
            "Own-account transfers paired across tracked accounts net out via 'Transfers in Transit'; "
            "unpaired legs stay in their transfer ledger (clearing).",
        ],
        sections=sections,
        totals={
            "total_debit": tb["total_debit"],
            "total_credit": tb["total_credit"],
            "difference": tb["difference"],
            "income": tb["income"],
            "expenses": tb["expenses"],
            "net_result": tb["net_result"],
        },
    )


# ── Balance sheet ───────────────────────────────────────────────────────────


def compute_balance_sheet(books: Books, as_at: date, fy_start: date) -> dict[str, Any]:
    bal = books.balances(None, as_at)
    before = books.balances(None, fy_start - timedelta(days=1))
    get = lambda lid: _q(bal.get(lid, ZERO))  # noqa: E731
    groups: dict[str, list[tuple[LedgerInfo, Decimal, Optional[str]]]] = defaultdict(list)
    for lg in sorted(books.ledgers.values(), key=lambda l: (l.sort_order, l.name.lower())):
        v = get(lg.id)
        if lg.cls in (CLS_ASSET, CLS_LIABILITY) and not lg.bank_account_id:
            # Non-bank asset / liability ledgers (loans owed, director's loan account):
            # presented on the side their balance falls (a DLA can flip).
            if v > 0:
                groups["asset_other"].append((lg, v, "debit balance" if lg.cls == CLS_LIABILITY else None))
            elif v < 0:
                if lg.cls == CLS_ASSET:
                    groups["liab_other"].append((lg, -v, "credit balance"))
                else:
                    groups["liab_loans"].append((lg, -v, None))
            continue
        if lg.cls == CLS_BANK or lg.cls in (CLS_ASSET, CLS_LIABILITY):
            acct = books.accounts.get(lg.bank_account_id) if lg.bank_account_id else None
            is_liab = (acct and acct.kind == LedgerType.LIABILITY.value) or lg.cls == CLS_LIABILITY
            if is_liab:
                groups["liab_loans"].append((lg, -v, None))
            elif v >= 0:
                groups["asset_bank"].append((lg, v, None))
            else:
                groups["liab_overdraft"].append((lg, -v, "overdrawn"))
        elif lg.cls == CLS_CAPITAL:
            if _is_loan_capital(lg):
                groups["liab_loan_capital"].append((lg, -v, "capital repaid on loans whose balance is not tracked"))
            elif v:
                groups["asset_capital"].append((lg, v, "at cost"))
        elif lg.cls == CLS_CLEARING:
            if v > 0:
                groups["asset_clearing"].append((lg, v, None))
            elif v < 0:
                groups["liab_clearing"].append((lg, -v, None))
        elif lg.cls == CLS_EQUITY:
            if v:
                groups["equity_other"].append((lg, -v, None))
        elif lg.cls == CLS_DRAWINGS:
            if v:
                groups["equity_drawings"].append((lg, -v, "cumulative"))
    pl_ids = [l.id for l in books.ledgers.values() if l.cls in (CLS_INCOME, CLS_EXPENSE)]
    re_bf = _q(-sum((before.get(i, ZERO) for i in pl_ids), ZERO))
    net_cur = _q(-sum((bal.get(i, ZERO) for i in pl_ids), ZERO) - re_bf)
    sum_ = lambda k: _q(sum((v for _, v, _ in groups.get(k, [])), ZERO))  # noqa: E731
    total_assets = sum_("asset_bank") + sum_("asset_capital") + sum_("asset_other") + sum_("asset_clearing")
    total_liab = (
        sum_("liab_overdraft") + sum_("liab_loans") + sum_("liab_loan_capital") + sum_("liab_other") + sum_("liab_clearing")
    )
    total_equity = sum_("equity_other") + re_bf + net_cur + sum_("equity_drawings")
    return {
        "groups": groups,
        "retained_bf": re_bf,
        "net_result_period": net_cur,
        "total_assets": _q(total_assets),
        "total_liabilities": _q(total_liab),
        "net_assets": _q(total_assets - total_liab),
        "total_equity": _q(total_equity),
        "difference": _q(total_assets - total_liab - total_equity),
        "sum": sum_,
    }


def build_balance_sheet(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    as_at: Optional[date] = None,
    books: Optional[Books] = None,
) -> SaSupportReport:
    books = books or build_books(db, user_profile_id)
    d_from, d_to, label, fy_month, years = _period(
        db, books, user_profile_id=user_profile_id, fy_start_year=fy_start_year,
        period=period, date_from=date_from, date_to=date_to, ref=ref,
    )
    as_at = as_at or d_to
    fy_start, _fy_end = fy_bounds(as_at, fy_month)
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    bs = compute_balance_sheet(books, as_at, fy_start)
    g = bs["groups"]
    re_id = books.roles[LedgerSystemRole.RETAINED_EARNINGS.value]

    def mk(key: str, title: str, items: list[tuple[LedgerInfo, Decimal, Optional[str]]], extra: list[SaReportLedgerLine] | None = None):
        lines = [
            SaReportLedgerLine(ledger_id=lg.id, ledger_name=lg.name, ledger_type=lg.type, amount=_q(v), note=n)
            for lg, v, n in items
        ] + (extra or [])
        if not lines:
            return None
        return SaReportSection(
            key=key, title=title, kind="totals", lines=lines,
            summary={"total": str(_q(sum((ln.amount for ln in lines), ZERO)))},
        )

    eq_extra = [
        SaReportLedgerLine(
            ledger_id=re_id, ledger_name="Retained earnings b/f (prior years' net result)",
            ledger_type="equity", amount=bs["retained_bf"],
        ),
        SaReportLedgerLine(
            ledger_id=re_id, ledger_name=f"Net result {fy_start.isoformat()} → {as_at.isoformat()}",
            ledger_type="equity", amount=bs["net_result_period"],
        ),
    ]
    sections = [
        mk("assets-bank", "Assets · Bank accounts", g.get("asset_bank", [])),
        mk("assets-capital", "Assets · Capital items", g.get("asset_capital", [])),
        mk("assets-other", "Assets · Loans receivable & director's loan (debit balances)", g.get("asset_other", [])),
        mk("assets-clearing", "Assets · Transfer clearing / suspense (debit balances)", g.get("asset_clearing", [])),
        mk("liab-overdraft", "Liabilities · Bank overdrafts", g.get("liab_overdraft", [])),
        mk("liab-loans", "Liabilities · Loans", g.get("liab_loans", []) + g.get("liab_loan_capital", [])),
        mk("liab-other", "Liabilities · Director's loan & other (credit balances)", g.get("liab_other", [])),
        mk("liab-clearing", "Liabilities · Transfer clearing (credit balances – unpaired inflows)", g.get("liab_clearing", [])),
        mk("equity", "Equity", g.get("equity_other", []), eq_extra),
        mk("equity-drawings", "Equity · Owner's drawings & personal (cumulative, reduces equity)", g.get("equity_drawings", [])),
    ]
    sections = [s for s in sections if s is not None]
    return _base(
        report_key="balance-sheet",
        title=f"Balance sheet as at {as_at.isoformat()}",
        d_from=fy_start,
        d_to=as_at,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Assets = Liabilities + Equity, from the double-entry journal (bank balances match printed statements).",
            "Overdrawn bank accounts are shown as liabilities; loans are liability ledgers (openings from evidence-based journals).",
            "Director's loan account: personal side (receipts from the company) and iDesign side (tracked company legs) – "
            "each shown on the side its balance falls; where both legs are tracked they eliminate.",
            "Transfer clearing holds unpaired own-account transfer legs (other side not tracked in this profile).",
            "Capital items are at cost (no depreciation). Drawings, income tax and personal spend reduce equity.",
        ],
        sections=sections,
        totals={
            "total_assets": bs["total_assets"],
            "total_liabilities": bs["total_liabilities"],
            "net_assets": bs["net_assets"],
            "total_equity": bs["total_equity"],
            "difference": bs["difference"],
        },
    )


# ── Bank reconciliation ─────────────────────────────────────────────────────

BANK_REC_COLUMNS = [
    "Statement",
    "Period",
    "Txns",
    "Printed opening",
    "Ledger b/f",
    "Gap adj.",
    "Movement",
    "Ledger closing",
    "Printed closing",
    "Difference",
    "Status",
]


def _s(v: Optional[Decimal]) -> Optional[str]:
    return None if v is None else str(_q(v))


def build_bank_reconciliation(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    books: Optional[Books] = None,
) -> SaSupportReport:
    books = books or build_books(db, user_profile_id)
    d_from, d_to, label, _, years = _period(
        db, books, user_profile_id=user_profile_id, fy_start_year=fy_start_year,
        period=period, date_from=date_from, date_to=date_to, ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    all_time = (period or "").lower() in ALL_TIME
    bal_to = books.balances(None, d_to)
    by_acct = defaultdict(list)
    for st in books.statements:
        ref_d = st.period_end or st.period_start
        if not all_time and ref_d is not None and not (d_from <= ref_d <= d_to):
            continue
        by_acct[st.account_id].append(st)
    sections: list[SaReportSection] = []
    overview_lines: list[SaReportLedgerLine] = []
    n_stmt = n_ok = n_gap = n_diff = n_nobal = 0
    abs_diff = ZERO
    gap_total = ZERO
    differences: list[list[Any]] = []
    for acct in sorted(books.accounts.values(), key=lambda a: a.name.lower()):
        stmts = by_acct.get(acct.id, [])
        lg = books.ledgers[acct.ledger_id]
        if not stmts:
            continue
        rows = []
        a_ok = a_diff = 0
        for st in stmts:
            n_stmt += 1
            status = st.status
            if status == "matched":
                n_ok += 1
                a_ok += 1
            elif status == "matched_after_gap_adjustment":
                n_gap += 1
                a_ok += 1
                gap_total += st.continuity_adjustment
            elif status == "difference":
                n_diff += 1
                a_diff += 1
                abs_diff += abs(st.closing_difference or ZERO)
            else:
                n_nobal += 1
            per = (
                f"{st.period_start.isoformat() if st.period_start else '?'} → {st.period_end.isoformat() if st.period_end else '?'}"
            )
            if st.overlaps_previous:
                per += " (overlaps previous"
                per += f"; {_s(st.overlap_movement)} already posted in overlap)" if st.overlap_movement else ")"
            row = [
                st.filename,
                per,
                st.tx_count,
                _s(st.printed_opening),
                _s(st.ledger_opening),
                _s(st.continuity_adjustment) if st.continuity_adjustment else "",
                _s(st.movement),
                _s(st.ledger_closing),
                _s(st.printed_closing),
                _s(st.closing_difference),
                status,
            ]
            rows.append(row)
            if status != "matched":
                differences.append([acct.name] + row)
        last = stmts[-1]
        sections.append(
            SaReportSection(
                key=f"rec-{acct.id}",
                title=f"{acct.name} ({acct.kind})",
                kind="table",
                columns=BANK_REC_COLUMNS,
                rows=rows,
                summary={
                    "statements": len(stmts),
                    "matched": a_ok,
                    "differences": a_diff,
                    "opening_balance": str(acct.opening_balance),
                    "opening_source": acct.opening_source or "",
                    "last_printed_closing": _s(last.printed_closing),
                    "ledger_balance_at_period_end": str(_q(bal_to.get(acct.ledger_id, ZERO))),
                },
            )
        )
        overview_lines.append(
            SaReportLedgerLine(
                ledger_id=lg.id,
                ledger_name=lg.name,
                ledger_type=lg.type,
                amount=_q(bal_to.get(acct.ledger_id, ZERO)),
                txn_count=sum(s.tx_count for s in stmts),
                note=f"{a_ok}/{len(stmts)} statements reconcile" + (f" · {a_diff} difference(s)" if a_diff else ""),
            )
        )
    head = [
        SaReportSection(
            key="rec-overview", title="Accounts (ledger balance at period end)", kind="totals", lines=overview_lines,
        )
    ]
    if differences:
        head.append(
            SaReportSection(
                key="rec-exceptions",
                title="Exceptions — statements not matching cleanly",
                kind="table",
                columns=["Account"] + BANK_REC_COLUMNS,
                rows=differences,
                stub_message=(
                    "'matched_after_gap_adjustment' = printed opening differed from the balance carried forward "
                    "(missing or overlapping statement); the gap was posted to Bank Reconciliation Suspense so the "
                    "ledger matches the bank again."
                ),
            )
        )
    return _base(
        report_key="bank-reconciliation",
        title="Bank reconciliation",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Per account, per statement: ledger balance b/f + statement movement vs the printed closing balance.",
            "Statements are included when their period ends inside the selected period (All time = every statement).",
        ],
        sections=head + sections,
        totals={
            "accounts": Decimal(len(sections)),
            "statements": Decimal(n_stmt),
            "matched": Decimal(n_ok),
            "matched_after_gap_adjustment": Decimal(n_gap),
            "differences": Decimal(n_diff),
            "no_printed_balance": Decimal(n_nobal),
            "total_abs_difference": _q(abs_diff),
            "gap_adjustments_net": _q(gap_total),
        },
    )


# ── General ledger ──────────────────────────────────────────────────────────

GL_CLASS_ORDER = [CLS_BANK, CLS_ASSET, CLS_LIABILITY, CLS_CAPITAL, CLS_CLEARING, CLS_EQUITY, CLS_DRAWINGS, CLS_INCOME, CLS_EXPENSE]


def build_general_ledger(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    ledger_id: Optional[int] = None,
    books: Optional[Books] = None,
    max_lines: Optional[int] = None,
) -> SaSupportReport:
    books = books or build_books(db, user_profile_id)
    d_from, d_to, label, _, years = _period(
        db, books, user_profile_id=user_profile_id, fy_start_year=fy_start_year,
        period=period, date_from=date_from, date_to=date_to, ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    cap = max_lines or (20000 if ledger_id is not None else 500)
    before = books.balances(None, d_from - timedelta(days=1))
    by_ledger: dict[int, list] = defaultdict(list)
    lo_hi = books.postings
    for p in lo_hi:
        if d_from <= p.date <= d_to:
            by_ledger[p.ledger_id].append(p)
    ledgers = sorted(
        books.ledgers.values(),
        key=lambda l: (GL_CLASS_ORDER.index(l.cls) if l.cls in GL_CLASS_ORDER else 99, l.sort_order, l.name.lower()),
    )
    if ledger_id is not None:
        ledgers = [l for l in ledgers if l.id == int(ledger_id)]
    sections: list[SaReportSection] = []
    total_dr = total_cr = ZERO
    for lg in ledgers:
        opening = ZERO if lg.cls in TEMPORARY_CLASSES else _q(before.get(lg.id, ZERO))
        posts = by_ledger.get(lg.id, [])
        if not posts and opening == 0 and ledger_id is None:
            continue
        running = opening
        dr = cr = ZERO
        lines: list[SaReportTxnLine] = []
        for p in posts:
            e = books.entries[p.entry_id]
            running = _q(running + p.amount)
            d, c = _dc(p.amount)
            dr += d
            cr += c
            if len(lines) >= cap:
                continue
            contra = [books.ledgers[l].name for l, a in e.postings if l != lg.id and a != 0]
            lines.append(
                SaReportTxnLine(
                    transaction_id=e.tx_id if e.tx_id is not None else -(e.id + 1),
                    date=p.date,
                    description=e.description,
                    amount=_q(p.amount),
                    ledger_id=lg.id,
                    ledger_name=", ".join(contra) or None,
                    source_file=e.source_file or (f"journal #{e.journal_id}: {e.source}"[:300] if e.journal_id else None),
                    drill_ledger_id=e.category_ledger_id,
                    running_balance=running,
                    debit=d if d else None,
                    credit=c if c else None,
                    counter_ledger=", ".join(contra) or None,
                    entry_kind=e.kind,
                )
            )
        total_dr += dr
        total_cr += cr
        sections.append(
            SaReportSection(
                key=f"lg-{lg.id}",
                title=f"{lg.name} ({lg.type})",
                kind="transactions",
                lines=[
                    SaReportLedgerLine(
                        ledger_id=lg.id, ledger_name=lg.name, ledger_type=lg.type,
                        amount=running, debit=_q(dr), credit=_q(cr), txn_count=len(posts),
                        note=f"opening {opening} · closing {running}",
                    )
                ],
                transactions=lines,
                summary={
                    "opening_balance": str(opening),
                    "debits": str(_q(dr)),
                    "credits": str(_q(cr)),
                    "closing_balance": str(running),
                    "postings": len(posts),
                    **({"listed": f"first {cap} of {len(posts)}"} if len(posts) > cap else {}),
                },
            )
        )
    return _base(
        report_key="general-ledger",
        title="General ledger (double-entry)",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Every ledger incl. bank / loan / equity ledgers, with opening balance, debit/credit postings and running balance.",
            "Amounts are debit-positive (credits negative). Contra ledger shown per line.",
            f"Pass ledger_id to focus on one ledger (up to 20000 lines); otherwise {cap} lines per ledger are listed.",
        ],
        sections=sections,
        totals={
            "ledgers_listed": Decimal(len(sections)),
            "total_debits": _q(total_dr),
            "total_credits": _q(total_cr),
            "difference": _q(total_dr - total_cr),
        },
    )


# ── Transfer pairing ────────────────────────────────────────────────────────


def build_transfer_pairing(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    books: Optional[Books] = None,
) -> SaSupportReport:
    books = books or build_books(db, user_profile_id)
    d_from, d_to, label, _, years = _period(
        db, books, user_profile_id=user_profile_id, fy_start_year=fy_start_year,
        period=period, date_from=date_from, date_to=date_to, ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    st = books.pairing
    acct = books.accounts
    in_period = [p for p in books.pairs if d_from <= min(p.out_date, p.in_date) <= d_to]
    pair_rows = [
        [
            p.out_date.isoformat(),
            acct[p.out_account_id].name,
            p.in_date.isoformat(),
            acct[p.in_account_id].name,
            str(_q(p.amount)),
            (p.in_date - p.out_date).days,
            p.out_tx,
            p.in_tx,
        ]
        for p in in_period[:1500]
    ]
    paired_ids = {p.out_tx for p in books.pairs} | {p.in_tx for p in books.pairs}
    unpaired = [
        e for e in books.entries
        if e.kind == "bank_tx" and e.category_ledger_id in books.ledgers
        and books.ledgers[e.category_ledger_id].type == LedgerType.TRANSFER.value
        and d_from <= e.date <= d_to and e.tx_id not in paired_ids
    ]
    unpaired_lines = [
        SaReportTxnLine(
            transaction_id=e.tx_id or 0,
            date=e.date,
            description=f"[{acct[e.bank_account_id].name}] {e.description}" if e.bank_account_id in acct else e.description,
            amount=_q(next(a for l, a in e.postings if l != e.category_ledger_id)),
            ledger_id=e.category_ledger_id,
            ledger_name=books.ledgers[e.category_ledger_id].name,
            source_file=e.source_file,
            drill_ledger_id=e.category_ledger_id,
        )
        for e in unpaired[:1500]
    ]
    by_ledger_lines = [
        SaReportLedgerLine(
            ledger_id=lid,
            ledger_name=books.ledgers[lid].name,
            ledger_type=books.ledgers[lid].type,
            amount=_q(r["net"]),
            txn_count=r["count"],
            note=f"{r['count']} unpaired legs · gross {_q(r['amount'])}",
        )
        for lid, r in sorted(st.unpaired_by_ledger.items(), key=lambda x: -x[1]["amount"])
    ]
    cross_rows = [
        [c["transfer_ledger"], c["other_ledger"], c["count"], str(_q(c["amount"]))]
        for c in st.cross_type_examples
    ]
    return _base(
        report_key="transfer-pairing",
        title="Own-account transfer pairing",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Pairs a transfer-ledger outflow on one tracked account with an equal inflow on another tracked account "
            "within 4 days; paired legs post bank-to-bank (via Transfers in Transit) and leave the transfer ledgers.",
            "Coverage figures are all-time; lists below are filtered to the selected period.",
            "Cross-type candidates: an unpaired transfer leg whose mirror exists but is categorised to a non-transfer "
            "ledger (e.g. Personal Drawings). Not auto-paired because that would change income/expense or drawings.",
        ],
        sections=[
            SaReportSection(key="pair-unpaired-ledgers", title="Unpaired legs by transfer ledger (all time)", kind="totals", lines=by_ledger_lines),
            SaReportSection(
                key="pair-cross", title="Cross-type candidates (need a categorisation decision)", kind="table",
                columns=["Transfer ledger", "Mirror categorised as", "Legs", "Amount"], rows=cross_rows,
            ),
            SaReportSection(
                key="pair-list", title=f"Paired transfers in period ({len(in_period)})", kind="table",
                columns=["Out date", "From account", "In date", "To account", "Amount", "Days", "Out tx", "In tx"],
                rows=pair_rows,
            ),
            SaReportSection(
                key="pair-unpaired", title=f"Unpaired transfer legs in period ({len(unpaired)})", kind="transactions",
                transactions=unpaired_lines,
            ),
        ],
        totals={
            "transfer_legs": Decimal(st.transfer_legs),
            "paired_legs": Decimal(st.paired_legs),
            "pairs": Decimal(st.pairs),
            "unpaired_legs": Decimal(st.unpaired_legs),
            "coverage_pct_count": st.coverage_pct_count,
            "coverage_pct_amount": st.coverage_pct_amount,
            "paired_amount": _q(st.paired_amount),
            "unpaired_amount": _q(st.unpaired_amount),
            "cross_type_candidates": Decimal(st.cross_type_candidates),
        },
    )
