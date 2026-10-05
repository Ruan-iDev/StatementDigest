"""SA tax & accounting support reports (management workpapers, not eFiling forms)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Ledger, LedgerType, Transaction, UserProfile
from app.schemas import (
    FinancialYearOption,
    SaReportTxnLine,
    SaReportLedgerLine,
    SaReportSection,
    SaSupportReport,
)
from app.services.money import quantize_money
from app.services.reports import (
    fy_bounds,
    fy_start_year_for,
    list_financial_years,
    profile_pref,
    resolve_period,
)

ZERO = Decimal("0.00")
VAT_RATE = Decimal("0.15")  # SA standard rate
VAT_DIVISOR = Decimal("1.15")  # inclusive → exclusive factor base


def _q(v: Decimal | float | int | str | None) -> Decimal:
    if v is None:
        return ZERO
    return quantize_money(Decimal(str(v)))


def _name_has(name: str, *needles: str) -> bool:
    n = (name or "").lower()
    return any(nd.lower() in n for nd in needles)


def _resolve_fy_or_period(
    db: Session,
    *,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> tuple[date, date, str, int, list[FinancialYearOption]]:
    ref = ref or date.today()
    fy_start_month = int(profile_pref(db, user_profile_id, "fy_start_month", "3"))
    years, current_fy = list_financial_years(
        db, fy_start_month, user_profile_id=user_profile_id, ref=ref
    )
    if fy_start_year is not None:
        d_from, d_to = fy_bounds(date(int(fy_start_year), fy_start_month, 1), fy_start_month)
        label = next(
            (y.label for y in years if y.fy_start_year == int(fy_start_year)),
            f"FY {fy_start_year}",
        )
        return d_from, d_to, label, fy_start_month, years
    d_from, d_to, label = resolve_period(
        db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
        user_profile_id=user_profile_id,
    )
    return d_from, d_to, label, fy_start_month, years


def _ledgers(db: Session, user_profile_id: int) -> list[Ledger]:
    return (
        db.query(Ledger)
        .filter(
            Ledger.user_profile_id == user_profile_id,
            Ledger.is_archived.is_(False),
        )
        .order_by(Ledger.sort_order, Ledger.name)
        .all()
    )


def _ledger_totals(
    db: Session,
    user_profile_id: int,
    d_from: date,
    d_to: date,
) -> dict[int, Decimal]:
    rows = (
        db.query(Transaction.ledger_id, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.user_profile_id == user_profile_id,
            Transaction.is_categorised.is_(True),
            Transaction.ledger_id.isnot(None),
            Transaction.date >= d_from,
            Transaction.date <= d_to,
            Transaction.is_excluded.is_(False),
        )
        .group_by(Transaction.ledger_id)
        .all()
    )
    return {int(r.ledger_id): _q(r.total) for r in rows if r.ledger_id is not None}


def _txns_for_ledgers(
    db: Session,
    user_profile_id: int,
    d_from: date,
    d_to: date,
    ledger_ids: list[int],
    limit: int = 2000,
) -> list[Transaction]:
    if not ledger_ids:
        return []
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_profile_id == user_profile_id,
            Transaction.is_categorised.is_(True),
            Transaction.ledger_id.in_(ledger_ids),
            Transaction.date >= d_from,
            Transaction.date <= d_to,
            Transaction.is_excluded.is_(False),
        )
        .order_by(Transaction.date, Transaction.id)
        .limit(limit)
        .all()
    )


def _txn_line(tx: Transaction, ledger_name: str | None = None) -> SaReportTxnLine:
    return SaReportTxnLine(
        transaction_id=tx.id,
        date=tx.date,
        description=tx.description or "",
        amount=_q(tx.amount),
        ledger_id=tx.ledger_id,
        ledger_name=ledger_name,
        reference=tx.reference,
        source_file=tx.source_file,
        drill_ledger_id=tx.ledger_id,
    )


def _base(
    *,
    report_key: str,
    title: str,
    d_from: date,
    d_to: date,
    label: str,
    currency: str,
    status: str,
    years: list[FinancialYearOption],
    notes: list[str] | None = None,
    sections: list[SaReportSection] | None = None,
    totals: dict[str, Decimal] | None = None,
) -> SaSupportReport:
    return SaSupportReport(
        report_key=report_key,
        title=title,
        period_label=label,
        date_from=d_from,
        date_to=d_to,
        currency=currency,
        status=status,
        notes=notes or [],
        available_years=years,
        sections=sections or [],
        totals={k: _q(v) for k, v in (totals or {}).items()},
    )


def _find_ledgers(ledgers: list[Ledger], *needles: str) -> list[Ledger]:
    return [lg for lg in ledgers if _name_has(lg.name, *needles)]


def build_taxable_income(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)

    income_lines: list[SaReportLedgerLine] = []
    expense_lines: list[SaReportLedgerLine] = []
    excluded_lines: list[SaReportLedgerLine] = []
    total_income = ZERO
    total_expenses = ZERO

    for lg in ledgers:
        raw = totals_map.get(lg.id, ZERO)
        if raw == 0:
            continue
        # Exclude transfers and drawings from taxable worksheet
        is_drawings = lg.type == LedgerType.OTHER.value and _name_has(
            lg.name, "drawing", "personal drawings"
        )
        is_transfer = lg.type == LedgerType.TRANSFER.value
        is_capital = lg.type == LedgerType.CAPITAL.value

        if is_transfer or is_drawings:
            excluded_lines.append(
                SaReportLedgerLine(
                    ledger_id=lg.id,
                    ledger_name=lg.name,
                    ledger_type=lg.type,
                    amount=_q(raw),
                    txn_count=0,
                    note="Excluded (transfer/drawings)",
                )
            )
            continue
        if is_capital:
            excluded_lines.append(
                SaReportLedgerLine(
                    ledger_id=lg.id,
                    ledger_name=lg.name,
                    ledger_type=lg.type,
                    amount=_q(abs(raw)),
                    note="Capital — shown on capital schedule, not taxable P&L",
                )
            )
            continue

        if lg.type == LedgerType.INCOME.value:
            amt = _q(raw)
            income_lines.append(
                SaReportLedgerLine(
                    ledger_id=lg.id,
                    ledger_name=lg.name,
                    ledger_type=lg.type,
                    amount=amt,
                )
            )
            total_income += amt
        elif lg.type == LedgerType.EXPENSE.value:
            amt = _q(abs(raw))
            expense_lines.append(
                SaReportLedgerLine(
                    ledger_id=lg.id,
                    ledger_name=lg.name,
                    ledger_type=lg.type,
                    amount=amt,
                )
            )
            total_expenses += amt
        else:
            # other (non-drawings) — show as adjustment
            excluded_lines.append(
                SaReportLedgerLine(
                    ledger_id=lg.id,
                    ledger_name=lg.name,
                    ledger_type=lg.type,
                    amount=_q(raw),
                    note="Other — review for tax treatment",
                )
            )

    taxable = _q(total_income - total_expenses)
    return _base(
        report_key="taxable-income",
        title="Taxable income worksheet",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Management worksheet only — not an ITR12 / ITR14.",
            "Transfers and Personal Drawings are excluded from taxable income.",
            "Capital ledgers are excluded here; see Capital schedule.",
        ],
        sections=[
            SaReportSection(
                key="income",
                title="Taxable income (receipts)",
                kind="totals",
                lines=income_lines,
            ),
            SaReportSection(
                key="expenses",
                title="Allowable / operating expenses (absolute)",
                kind="totals",
                lines=expense_lines,
            ),
            SaReportSection(
                key="excluded",
                title="Excluded / for review",
                kind="totals",
                lines=excluded_lines,
            ),
        ],
        totals={
            "total_income": total_income,
            "total_expenses": total_expenses,
            "estimated_taxable_income": taxable,
        },
    )


def build_interest_summary(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    # Prefer "Interest Received" income ledger; exclude finance-charge expenses
    interest_lgs = [
        lg
        for lg in ledgers
        if lg.type == LedgerType.INCOME.value
        and _name_has(lg.name, "interest")
        and not _name_has(lg.name, "finance", "charge")
    ]
    if not interest_lgs:
        interest_lgs = _find_ledgers(ledgers, "Interest Received")

    ids = [lg.id for lg in interest_lgs]
    name_by_id = {lg.id: lg.name for lg in interest_lgs}
    txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, ids)
    total = _q(sum((_q(t.amount) for t in txns), ZERO))
    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(
                sum((_q(t.amount) for t in txns if t.ledger_id == lg.id), ZERO)
            ),
            txn_count=sum(1 for t in txns if t.ledger_id == lg.id),
        )
        for lg in interest_lgs
    ]
    return _base(
        report_key="interest-summary",
        title="IT3(b)-style interest summary",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Workpaper aligned to IT3(b) interest concepts — not a bank IT3(b) certificate.",
            "Source: Interest Received (and similar income) ledger(s).",
        ],
        sections=[
            SaReportSection(key="ledgers", title="Interest ledgers", kind="totals", lines=lines),
            SaReportSection(
                key="transactions",
                title="Interest transactions",
                kind="transactions",
                transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in txns],
            ),
        ],
        totals={"total_interest": total, "txn_count": Decimal(len(txns))},
    )


def build_medical_credit(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    med_lgs = [lg for lg in ledgers if _name_has(lg.name, "medical", "health")]
    ids = [lg.id for lg in med_lgs]
    name_by_id = {lg.id: lg.name for lg in med_lgs}
    txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, ids)
    total = _q(sum((_q(abs(t.amount)) for t in txns), ZERO))
    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(sum((_q(abs(t.amount)) for t in txns if t.ledger_id == lg.id), ZERO)),
            txn_count=sum(1 for t in txns if t.ledger_id == lg.id),
        )
        for lg in med_lgs
    ]
    return _base(
        report_key="medical-credit",
        title="Medical tax credit support",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="partial",
        years=years,
        notes=[
            "Lists Medical / Health spend for MTC / additional medical deduction support.",
            "Does not calculate statutory medical tax credits — rates change; use SARS tables.",
        ],
        sections=[
            SaReportSection(key="ledgers", title="Medical ledgers", kind="totals", lines=lines),
            SaReportSection(
                key="transactions",
                title="Medical / health transactions",
                kind="transactions",
                transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in txns],
            ),
        ],
        totals={"total_medical_spend": total, "txn_count": Decimal(len(txns))},
    )


def build_travel_motor(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    motor_lgs = [lg for lg in ledgers if _name_has(lg.name, "motor vehicle", "motor")]
    travel_lgs = [
        lg
        for lg in ledgers
        if _name_has(lg.name, "travel") and lg.id not in {m.id for m in motor_lgs}
    ]
    all_lgs = motor_lgs + travel_lgs
    ids = [lg.id for lg in all_lgs]
    name_by_id = {lg.id: lg.name for lg in all_lgs}
    txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, ids)

    def _section(key: str, title: str, group: list[Ledger]) -> SaReportSection:
        gids = {lg.id for lg in group}
        gtx = [t for t in txns if t.ledger_id in gids]
        lines = [
            SaReportLedgerLine(
                ledger_id=lg.id,
                ledger_name=lg.name,
                ledger_type=lg.type,
                amount=_q(sum((_q(abs(t.amount)) for t in gtx if t.ledger_id == lg.id), ZERO)),
                txn_count=sum(1 for t in gtx if t.ledger_id == lg.id),
            )
            for lg in group
        ]
        return SaReportSection(
            key=key,
            title=title,
            kind="totals",
            lines=lines,
            transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in gtx],
        )

    motor_total = _q(
        sum((_q(abs(t.amount)) for t in txns if t.ledger_id in {m.id for m in motor_lgs}), ZERO)
    )
    travel_total = _q(
        sum((_q(abs(t.amount)) for t in txns if t.ledger_id in {m.id for m in travel_lgs}), ZERO)
    )
    return _base(
        report_key="travel-motor",
        title="Travel / motor log",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="partial",
        years=years,
        notes=[
            "Totals from Motor Vehicle and Travel & Accommodation ledgers.",
            "No odometer / km log yet — stub for future travel log fields.",
        ],
        sections=[
            _section("motor", "Motor vehicle", motor_lgs),
            _section("travel", "Travel & accommodation", travel_lgs),
        ],
        totals={
            "motor_total": motor_total,
            "travel_total": travel_total,
            "combined_total": _q(motor_total + travel_total),
        },
    )


def build_capital_schedule(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    cap_lgs = [lg for lg in ledgers if lg.type == LedgerType.CAPITAL.value]
    ids = [lg.id for lg in cap_lgs]
    name_by_id = {lg.id: lg.name for lg in cap_lgs}
    txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, ids)
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)
    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(abs(totals_map.get(lg.id, ZERO))),
            txn_count=sum(1 for t in txns if t.ledger_id == lg.id),
        )
        for lg in cap_lgs
        if totals_map.get(lg.id, ZERO) != 0
    ]
    total = _q(sum((ln.amount for ln in lines), ZERO))
    return _base(
        report_key="capital-schedule",
        title="Capital schedule",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Capital-type ledgers (asset purchases, loan capital portion, etc.).",
            "Not a fixed-asset register with depreciation — workpaper only.",
        ],
        sections=[
            SaReportSection(key="capital", title="Capital movements", kind="totals", lines=lines),
            SaReportSection(
                key="transactions",
                title="Capital transactions",
                kind="transactions",
                transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in txns],
            ),
        ],
        totals={"total_capital": total},
    )


def build_provisional_tax(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    sars_lgs = [
        lg
        for lg in ledgers
        if _name_has(lg.name, "sars")
        and not _name_has(lg.name, "vat")
    ]
    if not sars_lgs:
        sars_lgs = [lg for lg in ledgers if _name_has(lg.name, "provisional")]
    ids = [lg.id for lg in sars_lgs]
    name_by_id = {lg.id: lg.name for lg in sars_lgs}
    txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, ids)
    # Prefer outflows as payments (negative amounts in bank convention)
    paid = _q(sum((_q(abs(t.amount)) for t in txns if _q(t.amount) <= 0), ZERO))
    refunds = _q(sum((_q(t.amount) for t in txns if _q(t.amount) > 0), ZERO))
    if paid == 0 and txns:
        # Fallback: treat all absolute as payments if signs mixed oddly
        paid = _q(sum((_q(abs(t.amount)) for t in txns), ZERO))
        refunds = ZERO
    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(sum((_q(abs(t.amount)) for t in txns if t.ledger_id == lg.id), ZERO)),
            txn_count=sum(1 for t in txns if t.ledger_id == lg.id),
        )
        for lg in sars_lgs
    ]
    # Rough estimate hook from taxable worksheet
    taxable_rep = build_taxable_income(
        db,
        user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=d_from,
        date_to=d_to,
        ref=ref,
    )
    est_taxable = taxable_rep.totals.get("estimated_taxable_income", ZERO)
    return _base(
        report_key="provisional-tax",
        title="Provisional tax tracker",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Tracks payments on SARS / provisional tax ledger(s).",
            "Does not compute IRP6 liability — estimate taxable income shown for cash planning only.",
        ],
        sections=[
            SaReportSection(key="ledgers", title="SARS ledgers", kind="totals", lines=lines),
            SaReportSection(
                key="transactions",
                title="SARS / provisional payments",
                kind="transactions",
                transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in txns],
            ),
        ],
        totals={
            "payments_out": paid,
            "refunds_in": refunds,
            "net_paid": _q(paid - refunds),
            "estimated_taxable_income": est_taxable,
            "txn_count": Decimal(len(txns)),
        },
    )


def build_vat_201(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)

    vat_lgs = [lg for lg in ledgers if _name_has(lg.name, "vat")]
    sales_lgs = [
        lg
        for lg in ledgers
        if lg.type == LedgerType.INCOME.value
        and _name_has(lg.name, "sales", "invoice", "client / project", "turnover")
    ]
    purchase_lgs = [
        lg
        for lg in ledgers
        if lg.type == LedgerType.EXPENSE.value
        and _name_has(lg.name, "cost of sales", "purchases", "subcontractor")
    ]

    sales_gross = _q(sum((totals_map.get(lg.id, ZERO) for lg in sales_lgs), ZERO))
    purchases_gross = _q(
        sum((_q(abs(totals_map.get(lg.id, ZERO))) for lg in purchase_lgs), ZERO)
    )
    # Inclusive VAT heuristics
    output_vat = _q(sales_gross * VAT_RATE / VAT_DIVISOR) if sales_gross else ZERO
    input_vat = _q(purchases_gross * VAT_RATE / VAT_DIVISOR) if purchases_gross else ZERO
    vat_ledger_net = _q(sum((totals_map.get(lg.id, ZERO) for lg in vat_lgs), ZERO))

    vat_ids = [lg.id for lg in vat_lgs]
    name_by_id = {lg.id: lg.name for lg in vat_lgs}
    vat_txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, vat_ids)

    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(totals_map.get(lg.id, ZERO)),
        )
        for lg in [*sales_lgs, *purchase_lgs, *vat_lgs]
        if totals_map.get(lg.id, ZERO) != 0
    ]
    return _base(
        report_key="vat-201",
        title="VAT 201 pack",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="partial",
        years=years,
        notes=[
            "Heuristic pack for VAT 201 workpapers — not a SARS VAT 201 return.",
            "Output/input VAT estimated at 15% inclusive on tagged sales/purchases ledgers.",
            "VAT Reserve & SARS VAT ledger movements listed for reconciliation.",
        ],
        sections=[
            SaReportSection(
                key="bases",
                title="Sales / purchases / VAT ledgers",
                kind="totals",
                lines=lines,
            ),
            SaReportSection(
                key="vat_txns",
                title="VAT ledger transactions",
                kind="transactions",
                transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in vat_txns],
            ),
            SaReportSection(
                key="box_hints",
                title="VAT 201 box hints (estimate)",
                kind="summary",
                summary={
                    "standard_rated_supplies_incl_estimate": str(sales_gross),
                    "output_vat_15pct_incl_estimate": str(output_vat),
                    "standard_rated_purchases_incl_estimate": str(purchases_gross),
                    "input_vat_15pct_incl_estimate": str(input_vat),
                    "vat_ledger_net_movement": str(vat_ledger_net),
                    "net_vat_payable_estimate": str(_q(output_vat - input_vat)),
                },
            ),
        ],
        totals={
            "sales_gross": sales_gross,
            "purchases_gross": purchases_gross,
            "output_vat_estimate": output_vat,
            "input_vat_estimate": input_vat,
            "net_vat_payable_estimate": _q(output_vat - input_vat),
            "vat_ledger_net": vat_ledger_net,
        },
    )


def build_irp5_emp201_stub(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)
    wage_lgs = [
        lg
        for lg in ledgers
        if _name_has(lg.name, "salary", "wage", "staff", "commission")
        and lg.type in (LedgerType.EXPENSE.value, LedgerType.INCOME.value)
    ]
    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(abs(totals_map.get(lg.id, ZERO))),
        )
        for lg in wage_lgs
        if totals_map.get(lg.id, ZERO) != 0
    ]
    return _base(
        report_key="irp5-emp201",
        title="IRP5 / EMP201 support",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="stub",
        years=years,
        notes=[
            "Placeholder for employer payroll returns (EMP201 / IRP5).",
            "LedgerFlow is not a payroll engine — wage ledger totals shown for hand-off only.",
        ],
        sections=[
            SaReportSection(
                key="placeholder",
                title="Coming soon",
                kind="placeholder",
                stub_message=(
                    "EMP201 monthly / bi-annual reconciliation and IRP5 certificates "
                    "will hook into Work Flow wages when payroll export lands."
                ),
                lines=lines,
            ),
        ],
        totals={
            "wage_ledger_total": _q(sum((ln.amount for ln in lines), ZERO)),
        },
    )


def build_related_party(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    rel_lgs = [
        lg
        for lg in ledgers
        if _name_has(
            lg.name,
            "drawing",
            "company funding",
            "spouse",
            "family support",
            "personal aid",
            "director",
            "shareholder",
            "loan account",
        )
    ]
    ids = [lg.id for lg in rel_lgs]
    name_by_id = {lg.id: lg.name for lg in rel_lgs}
    txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, ids)
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)
    lines = [
        SaReportLedgerLine(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            amount=_q(totals_map.get(lg.id, ZERO)),
            debit=_q(abs(totals_map[lg.id])) if totals_map.get(lg.id, ZERO) < 0 else ZERO,
            credit=_q(totals_map[lg.id]) if totals_map.get(lg.id, ZERO) > 0 else ZERO,
            txn_count=sum(1 for t in txns if t.ledger_id == lg.id),
        )
        for lg in rel_lgs
        if totals_map.get(lg.id, ZERO) != 0
    ]
    return _base(
        report_key="related-party",
        title="Related-party / drawings schedule",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Company Funding, Personal Drawings, spouse/family support and similar ledgers.",
            "Useful for close-corporation / company loan-account workpapers.",
        ],
        sections=[
            SaReportSection(
                key="schedules",
                title="Related-party ledgers",
                kind="totals",
                lines=lines,
            ),
            SaReportSection(
                key="transactions",
                title="Related-party transactions",
                kind="transactions",
                transactions=[_txn_line(t, name_by_id.get(t.ledger_id or 0)) for t in txns],
            ),
        ],
        totals={
            "net_movement": _q(sum((ln.amount for ln in lines), ZERO)),
            "total_outflows": _q(sum((ln.debit for ln in lines), ZERO)),
            "total_inflows": _q(sum((ln.credit for ln in lines), ZERO)),
        },
    )


def build_trial_balance(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)
    lines: list[SaReportLedgerLine] = []
    total_debit = ZERO
    total_credit = ZERO
    for lg in ledgers:
        raw = totals_map.get(lg.id, ZERO)
        if raw == 0:
            continue
        # Bank convention: positive = inflow (credit-ish for income), negative = outflow
        if lg.type == LedgerType.INCOME.value:
            debit, credit = ZERO, _q(raw if raw > 0 else abs(raw))
            if raw < 0:
                debit, credit = _q(abs(raw)), ZERO
        elif lg.type in (
            LedgerType.EXPENSE.value,
            LedgerType.CAPITAL.value,
        ):
            debit, credit = _q(abs(raw)), ZERO
            if raw > 0:
                debit, credit = ZERO, _q(raw)
        elif lg.type == LedgerType.TRANSFER.value:
            if raw >= 0:
                debit, credit = ZERO, _q(raw)
            else:
                debit, credit = _q(abs(raw)), ZERO
        else:
            if raw >= 0:
                debit, credit = ZERO, _q(raw)
            else:
                debit, credit = _q(abs(raw)), ZERO
        total_debit += debit
        total_credit += credit
        lines.append(
            SaReportLedgerLine(
                ledger_id=lg.id,
                ledger_name=lg.name,
                ledger_type=lg.type,
                amount=_q(raw),
                debit=debit,
                credit=credit,
            )
        )
    return _base(
        report_key="trial-balance",
        title="Trial balance",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Cash-book style trial balance from categorised bank transactions.",
            "Not a full double-entry TB — debit/credit mapped from ledger types.",
        ],
        sections=[
            SaReportSection(key="tb", title="Trial balance", kind="totals", lines=lines),
        ],
        totals={
            "total_debit": total_debit,
            "total_credit": total_credit,
            "difference": _q(total_debit - total_credit),
        },
    )


def build_general_ledger(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    ledger_id: Optional[int] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    ledgers = _ledgers(db, user_profile_id)
    if ledger_id is not None:
        ledgers = [lg for lg in ledgers if lg.id == int(ledger_id)]
    totals_map = _ledger_totals(db, user_profile_id, d_from, d_to)
    # Only ledgers with activity (unless filtered to one)
    active = [
        lg
        for lg in ledgers
        if ledger_id is not None or totals_map.get(lg.id, ZERO) != 0
    ]
    sections: list[SaReportSection] = []
    grand = ZERO
    for lg in active[:80]:  # cap sections for response size
        txns = _txns_for_ledgers(db, user_profile_id, d_from, d_to, [lg.id], limit=500)
        running = ZERO
        txn_lines: list[SaReportTxnLine] = []
        for t in txns:
            running = _q(running + _q(t.amount))
            line = _txn_line(t, lg.name)
            line = line.model_copy(update={"running_balance": running})
            txn_lines.append(line)
        amt = _q(totals_map.get(lg.id, ZERO))
        grand += amt
        sections.append(
            SaReportSection(
                key=f"lg-{lg.id}",
                title=f"{lg.name} ({lg.type})",
                kind="transactions",
                lines=[
                    SaReportLedgerLine(
                        ledger_id=lg.id,
                        ledger_name=lg.name,
                        ledger_type=lg.type,
                        amount=amt,
                        txn_count=len(txns),
                    )
                ],
                transactions=txn_lines,
            )
        )
    return _base(
        report_key="general-ledger",
        title="General ledger",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="live",
        years=years,
        notes=[
            "Per-ledger transaction listing with running balance.",
            "Pass ledger_id to focus on one account. Capped at 80 ledgers / 500 txns each.",
        ],
        sections=sections,
        totals={"ledgers_listed": Decimal(len(sections)), "net_movement": _q(grand)},
    )


def build_cashflow_indirect(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    period: str = "financial_year",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    taxable = build_taxable_income(
        db,
        user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=d_from,
        date_to=d_to,
        ref=ref,
    )
    capital = build_capital_schedule(
        db,
        user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=d_from,
        date_to=d_to,
        ref=ref,
    )
    related = build_related_party(
        db,
        user_profile_id,
        fy_start_year=fy_start_year,
        period=period,
        date_from=d_from,
        date_to=d_to,
        ref=ref,
    )
    net_result = taxable.totals.get("estimated_taxable_income", ZERO)
    cap_out = capital.totals.get("total_capital", ZERO)
    drawings_net = related.totals.get("net_movement", ZERO)
    # Indirect stub: operating ≈ net; investing = -capital; financing ≈ related-party
    operating = net_result
    investing = _q(-cap_out)
    financing = drawings_net
    net_change = _q(operating + investing + financing)
    return _base(
        report_key="cashflow-indirect",
        title="Cash-flow (indirect)",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="stub",
        years=years,
        notes=[
            "Indirect cash-flow stub derived from taxable worksheet, capital and related-party.",
            "Not IAS 7 compliant — no opening/closing cash without multi-account balances.",
        ],
        sections=[
            SaReportSection(
                key="indirect",
                title="Indirect cash-flow outline",
                kind="summary",
                summary={
                    "operating_activities_approx": str(operating),
                    "investing_activities_approx": str(investing),
                    "financing_activities_approx": str(financing),
                    "net_change_in_cash_approx": str(net_change),
                },
                stub_message="Full statement with opening/closing cash requires bank balance imports.",
            ),
        ],
        totals={
            "operating": operating,
            "investing": investing,
            "financing": financing,
            "net_change": net_change,
        },
    )


def build_fy_pack(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period="financial_year",
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    builders = [
        ("taxable-income", build_taxable_income),
        ("interest-summary", build_interest_summary),
        ("medical-credit", build_medical_credit),
        ("travel-motor", build_travel_motor),
        ("capital-schedule", build_capital_schedule),
        ("provisional-tax", build_provisional_tax),
        ("vat-201", build_vat_201),
        ("related-party", build_related_party),
        ("trial-balance", build_trial_balance),
    ]
    sections: list[SaReportSection] = []
    for key, fn in builders:
        rep = fn(
            db,
            user_profile_id,
            fy_start_year=fy_start_year,
            period="financial_year",
            date_from=d_from,
            date_to=d_to,
            ref=ref,
        )
        sections.append(
            SaReportSection(
                key=key,
                title=rep.title,
                kind="summary",
                summary={k: str(v) for k, v in rep.totals.items()},
                stub_message=f"status={rep.status}; open /reports/{key} for detail",
            )
        )
    return _base(
        report_key="fy-pack",
        title="FY pack",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="partial",
        years=years,
        notes=[
            "Index of year-end support reports. PDF concatenates summary pages.",
            "Existing P&L matrix PDF remains available via /reports/pl/pdf.",
        ],
        sections=sections,
        totals={"reports_included": Decimal(len(sections))},
    )


def build_consolidation_stub(
    db: Session,
    user_profile_id: int,
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
) -> SaSupportReport:
    d_from, d_to, label, _, years = _resolve_fy_or_period(
        db,
        user_profile_id=user_profile_id,
        fy_start_year=fy_start_year,
        period="financial_year",
        ref=ref,
    )
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    profiles = db.query(UserProfile).order_by(UserProfile.id).all()
    lines = [
        SaReportLedgerLine(
            ledger_id=p.id,
            ledger_name=p.name,
            ledger_type=p.profile_type,
            amount=ZERO,
            note="Profile shell — consolidation not yet computed",
        )
        for p in profiles
    ]
    return _base(
        report_key="consolidation",
        title="Multi-profile consolidation",
        d_from=d_from,
        d_to=d_to,
        label=label,
        currency=currency,
        status="stub",
        years=years,
        notes=[
            "Minimal stub: lists workspaces available on this install.",
            "Cross-profile roll-up is not implemented — profiles stay isolated by design.",
        ],
        sections=[
            SaReportSection(
                key="profiles",
                title="Workspaces",
                kind="placeholder",
                stub_message="Select profiles to consolidate in a future release.",
                lines=lines,
            ),
        ],
        totals={"profile_count": Decimal(len(profiles))},
    )


REPORT_BUILDERS: dict[str, Any] = {
    "taxable-income": build_taxable_income,
    "interest-summary": build_interest_summary,
    "medical-credit": build_medical_credit,
    "travel-motor": build_travel_motor,
    "capital-schedule": build_capital_schedule,
    "provisional-tax": build_provisional_tax,
    "vat-201": build_vat_201,
    "irp5-emp201": build_irp5_emp201_stub,
    "related-party": build_related_party,
    "trial-balance": build_trial_balance,
    "general-ledger": build_general_ledger,
    "cashflow-indirect": build_cashflow_indirect,
    "fy-pack": build_fy_pack,
    "consolidation": build_consolidation_stub,
}


def report_catalog() -> list[dict[str, str]]:
    return [
        {
            "key": "taxable-income",
            "title": "Taxable income worksheet",
            "group": "individual",
            "status": "live",
        },
        {
            "key": "interest-summary",
            "title": "IT3(b)-style interest summary",
            "group": "individual",
            "status": "live",
        },
        {
            "key": "medical-credit",
            "title": "Medical tax credit support",
            "group": "individual",
            "status": "partial",
        },
        {
            "key": "travel-motor",
            "title": "Travel / motor log",
            "group": "individual",
            "status": "partial",
        },
        {
            "key": "capital-schedule",
            "title": "Capital schedule",
            "group": "individual",
            "status": "live",
        },
        {
            "key": "provisional-tax",
            "title": "Provisional tax tracker",
            "group": "individual",
            "status": "live",
        },
        {
            "key": "vat-201",
            "title": "VAT 201 pack",
            "group": "companies",
            "status": "partial",
        },
        {
            "key": "irp5-emp201",
            "title": "IRP5 / EMP201 support",
            "group": "companies",
            "status": "stub",
        },
        {
            "key": "related-party",
            "title": "Related-party / drawings schedule",
            "group": "companies",
            "status": "live",
        },
        {
            "key": "trial-balance",
            "title": "Trial balance",
            "group": "companies",
            "status": "live",
        },
        {
            "key": "general-ledger",
            "title": "General ledger",
            "group": "companies",
            "status": "live",
        },
        {
            "key": "cashflow-indirect",
            "title": "Cash-flow (indirect)",
            "group": "companies",
            "status": "stub",
        },
        {
            "key": "fy-pack",
            "title": "FY pack",
            "group": "cross",
            "status": "partial",
        },
        {
            "key": "consolidation",
            "title": "Multi-profile consolidation",
            "group": "cross",
            "status": "stub",
        },
    ]
