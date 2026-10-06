"""Report builders. Zero-value ledgers are never included."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AppSettings, Ledger, LedgerType, Transaction, UserProfile
from app.schemas import PLLineItem, PLReport
from app.services.money import quantize_money


def get_setting(db: Session, key: str, default: str) -> str:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else default


def profile_pref(db: Session, user_profile_id: int | None, key: str, default: str) -> str:
    if user_profile_id:
        p = db.get(UserProfile, user_profile_id)
        if p:
            if key == "fy_start_month":
                return str(p.fy_start_month or default)
            if key == "currency":
                return p.currency or default
    return get_setting(db, key, default)


def fy_bounds(ref: date, fy_start_month: int) -> tuple[date, date]:
    """Financial year containing `ref`. Default SA: March–February."""
    if ref.month >= fy_start_month:
        start = date(ref.year, fy_start_month, 1)
        end_year = ref.year + 1
    else:
        start = date(ref.year - 1, fy_start_month, 1)
        end_year = ref.year
    # Day before next FY start
    if fy_start_month == 1:
        end = date(end_year - 1, 12, 31)
    else:
        end_month = fy_start_month - 1
        end = date(end_year, end_month, monthrange(end_year, end_month)[1])
    return start, end


def month_bounds(ref: date) -> tuple[date, date]:
    return date(ref.year, ref.month, 1), date(
        ref.year, ref.month, monthrange(ref.year, ref.month)[1]
    )


def last_n_months_bounds(ref: date, n: int = 12) -> tuple[date, date]:
    # Approximate: go back n months to day 1
    y, m = ref.year, ref.month
    m -= n - 1
    while m <= 0:
        m += 12
        y -= 1
    start = date(y, m, 1)
    end = date(ref.year, ref.month, monthrange(ref.year, ref.month)[1])
    return start, end


def resolve_period(
    db: Session,
    period: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    user_profile_id: Optional[int] = None,
) -> tuple[date, date, str]:
    ref = ref or date.today()
    fy_start = int(profile_pref(db, user_profile_id, "fy_start_month", "3"))
    period = (period or "monthly").lower()

    if period == "custom" and date_from and date_to:
        return date_from, date_to, f"{date_from.isoformat()} → {date_to.isoformat()}"
    if period == "financial_year" or period == "fy":
        a, b = fy_bounds(ref, fy_start)
        return a, b, f"FY {a.isoformat()} → {b.isoformat()}"
    if period == "last_12_months" or period == "l12m":
        a, b = last_n_months_bounds(ref, 12)
        return a, b, f"Last 12 months ({a.isoformat()} → {b.isoformat()})"
    # monthly default
    a, b = month_bounds(ref)
    return a, b, a.strftime("%B %Y")


def _traffic_light(amount: Decimal, budget: Optional[Decimal], ledger_type: str) -> str:
    """Green under budget / no budget; amber ≥80%; red over.

    For income ledgers, 'over budget' is inverted (more income = green).
    """
    if budget is None or budget == 0:
        return "none" if budget is None else "green"

    abs_amount = abs(amount)
    abs_budget = abs(budget)
    pct = abs_amount / abs_budget if abs_budget else Decimal("0")

    is_expense_like = ledger_type in (
        LedgerType.EXPENSE.value,
        LedgerType.CAPITAL.value,
        LedgerType.OTHER.value,
    )

    if is_expense_like:
        if pct > 1:
            return "red"
        if pct >= Decimal("0.80"):
            return "amber"
        return "green"
    # Income / transfer in – higher is better
    if pct >= 1:
        return "green"
    if pct >= Decimal("0.80"):
        return "amber"
    return "red"


def _period_budget(
    ledger: Ledger, date_from: date, date_to: date
) -> Optional[Decimal]:
    """Prorate monthly/annual budget to the selected period length."""
    days = (date_to - date_from).days + 1
    if days <= 0:
        return None
    if ledger.budget_monthly is not None:
        # months ≈ days/30.44
        months = Decimal(days) / Decimal("30.44")
        return quantize_money(Decimal(ledger.budget_monthly) * months)
    if ledger.budget_annual is not None:
        return quantize_money(Decimal(ledger.budget_annual) * Decimal(days) / Decimal("365"))
    return None


def parse_month_keys(months: Optional[list[str] | str]) -> list[tuple[int, int]]:
    """Parse YYYY-MM tokens into (year, month) pairs."""
    if months is None:
        return []
    if isinstance(months, str):
        tokens = [t.strip() for t in months.split(",") if t.strip()]
    else:
        tokens = [str(t).strip() for t in months if str(t).strip()]
    out: list[tuple[int, int]] = []
    for tok in tokens:
        try:
            y_s, m_s = tok.split("-", 1)
            y, m = int(y_s), int(m_s)
            if 1 <= m <= 12:
                out.append((y, m))
        except (TypeError, ValueError):
            continue
    # unique, chronological
    return sorted(set(out), key=lambda t: (t[0], t[1]))


def _budget_for_months(ledger: Ledger, month_keys: list[tuple[int, int]]) -> Optional[Decimal]:
    """Sum prorated budget across selected calendar months only."""
    if not month_keys:
        return None
    total: Optional[Decimal] = None
    for y, m in month_keys:
        d0 = date(y, m, 1)
        d1 = date(y, m, monthrange(y, m)[1])
        b = _period_budget(ledger, d0, d1)
        if b is None:
            continue
        total = (total or Decimal("0")) + b
    return quantize_money(total) if total is not None else None


def build_pl_report(
    db: Session,
    period: str = "monthly",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    user_profile_id: Optional[int] = None,
    months: Optional[list[str] | str] = None,
) -> PLReport:
    """
    Build a period report.

    When `months` is provided (YYYY-MM list), only those calendar months are included
    (non-contiguous selections are honoured). date_from/date_to still bound the query
    and label span.
    """
    from sqlalchemy import and_, extract, or_

    month_keys = parse_month_keys(months)

    if month_keys:
        d_from = date(month_keys[0][0], month_keys[0][1], 1)
        last_y, last_m = month_keys[-1]
        d_to = date(last_y, last_m, monthrange(last_y, last_m)[1])
        if len(month_keys) == 1:
            label = date(month_keys[0][0], month_keys[0][1], 1).strftime("%B %Y")
        else:
            names = [
                date(y, m, 1).strftime("%b %Y") for y, m in month_keys
            ]
            if len(names) <= 4:
                label = ", ".join(names)
            else:
                label = f"{names[0]} … {names[-1]} ({len(names)} months)"
    else:
        d_from, d_to, label = resolve_period(
            db, period, date_from, date_to, ref, user_profile_id=user_profile_id
        )

    currency = profile_pref(db, user_profile_id, "currency", "ZAR")

    # Aggregate by ledger – only categorised transactions
    tq = db.query(
        Transaction.ledger_id,
        func.sum(Transaction.amount).label("total"),
    ).filter(
        Transaction.is_categorised.is_(True),
        Transaction.is_excluded.is_(False),
        Transaction.ledger_id.isnot(None),
        Transaction.date >= d_from,
        Transaction.date <= d_to,
    )
    if month_keys:
        tq = tq.filter(
            or_(
                *[
                    and_(
                        extract("year", Transaction.date) == y,
                        extract("month", Transaction.date) == m,
                    )
                    for y, m in month_keys
                ]
            )
        )
    if user_profile_id is not None:
        tq = tq.filter(Transaction.user_profile_id == user_profile_id)
    rows = tq.group_by(Transaction.ledger_id).all()

    totals_by_ledger: dict[int, Decimal] = {
        int(r.ledger_id): quantize_money(Decimal(str(r.total))) for r in rows
    }

    lq = db.query(Ledger).filter(Ledger.is_archived.is_(False))
    if user_profile_id is not None:
        lq = lq.filter(Ledger.user_profile_id == user_profile_id)
    ledgers = {lg.id: lg for lg in lq.all()}

    income_lines: list[PLLineItem] = []
    expense_lines: list[PLLineItem] = []
    other_lines: list[PLLineItem] = []

    for ledger_id, total in totals_by_ledger.items():
        # CRITICAL: never show zero-value ledgers
        if total == 0:
            continue
        ledger = ledgers.get(ledger_id)
        if not ledger:
            continue

        if month_keys:
            budget = _budget_for_months(ledger, month_keys)
        else:
            budget = _period_budget(ledger, d_from, d_to)
        # For expenses, report absolute outflow as positive expense amount
        if ledger.type == LedgerType.EXPENSE.value:
            display_amount = quantize_money(abs(total) if total < 0 else total)
            # If user categorised inflows as expense, keep signed magnitude as abs for P&L expense section
            display_amount = quantize_money(abs(total))
        elif ledger.type == LedgerType.INCOME.value:
            display_amount = quantize_money(total)  # expect positive
        else:
            display_amount = quantize_money(total)

        variance = None
        budget_pct = None
        if budget is not None:
            variance = quantize_money(budget - abs(display_amount))
            if budget != 0:
                budget_pct = quantize_money(abs(display_amount) / abs(budget) * 100)

        line = PLLineItem(
            ledger_id=ledger.id,
            ledger_name=ledger.name,
            ledger_type=ledger.type,
            amount=display_amount,
            budget=budget,
            variance=variance,
            budget_pct=budget_pct,
            traffic_light=_traffic_light(display_amount, budget, ledger.type),
        )

        if ledger.type == LedgerType.INCOME.value:
            income_lines.append(line)
        elif ledger.type == LedgerType.EXPENSE.value:
            expense_lines.append(line)
        else:
            other_lines.append(line)

    income_lines.sort(key=lambda x: x.ledger_name)
    expense_lines.sort(key=lambda x: x.ledger_name)
    other_lines.sort(key=lambda x: x.ledger_name)

    total_income = quantize_money(sum((x.amount for x in income_lines), Decimal("0")))
    total_expenses = quantize_money(sum((x.amount for x in expense_lines), Decimal("0")))
    net = quantize_money(total_income - total_expenses)

    return PLReport(
        period_label=label,
        date_from=d_from,
        date_to=d_to,
        currency=currency,
        income_lines=income_lines,
        expense_lines=expense_lines,
        other_lines=other_lines,
        total_income=total_income,
        total_expenses=total_expenses,
        net_result=net,
    )


def fy_start_year_for(d: date, fy_start_month: int) -> int:
    """Year in which the financial year containing `d` begins."""
    if d.month >= fy_start_month:
        return d.year
    return d.year - 1


def fy_label(fy_start_year: int, fy_start_month: int) -> str:
    """e.g. FY 2025/26 for Mar-start; FY 2025 for Jan-start."""
    if fy_start_month == 1:
        return f"FY {fy_start_year}"
    end_yy = (fy_start_year + 1) % 100
    return f"FY {fy_start_year}/{end_yy:02d}"


def fy_month_keys(fy_start_year: int, fy_start_month: int) -> list[tuple[int, int]]:
    """12 (year, month) pairs left→right for one financial year."""
    keys: list[tuple[int, int]] = []
    y, m = fy_start_year, fy_start_month
    for _ in range(12):
        keys.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return keys


def _month_totals(
    db: Session,
    yy: int,
    mm: int,
    ledgers: list[Ledger],
    user_profile_id: Optional[int],
) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal]:
    """income, expenses, income_budget, expense_budget, net for one calendar month."""
    d_from = date(yy, mm, 1)
    d_to = date(yy, mm, monthrange(yy, mm)[1])

    tq = db.query(
        Transaction.ledger_id,
        func.sum(Transaction.amount).label("total"),
    ).filter(
        Transaction.is_categorised.is_(True),
        Transaction.is_excluded.is_(False),
        Transaction.ledger_id.isnot(None),
        Transaction.date >= d_from,
        Transaction.date <= d_to,
    )
    if user_profile_id is not None:
        tq = tq.filter(Transaction.user_profile_id == user_profile_id)
    rows = tq.group_by(Transaction.ledger_id).all()
    by_ledger = {int(r.ledger_id): quantize_money(Decimal(str(r.total))) for r in rows}

    income = Decimal("0")
    expenses = Decimal("0")
    income_budget = Decimal("0")
    expense_budget = Decimal("0")
    ledger_by_id = {lg.id: lg for lg in ledgers}

    for lid, total in by_ledger.items():
        lg = ledger_by_id.get(lid)
        if not lg:
            continue
        if lg.type == LedgerType.INCOME.value:
            income += total if total > 0 else abs(total)
        elif lg.type == LedgerType.EXPENSE.value:
            expenses += abs(total)

    for lg in ledgers:
        b = _period_budget(lg, d_from, d_to)
        if b is None:
            continue
        if lg.type == LedgerType.INCOME.value:
            income_budget += abs(b)
        elif lg.type == LedgerType.EXPENSE.value:
            expense_budget += abs(b)

    income = quantize_money(income)
    expenses = quantize_money(expenses)
    income_budget = quantize_money(income_budget)
    expense_budget = quantize_money(expense_budget)
    return income, expenses, income_budget, expense_budget, quantize_money(income - expenses)


def list_financial_years(
    db: Session,
    fy_start_month: int,
    user_profile_id: Optional[int] = None,
    ref: Optional[date] = None,
):
    """Current FY plus any FY that has categorised transactions on record."""
    from app.schemas import FinancialYearOption

    ref = ref or date.today()
    current_fy = fy_start_year_for(ref, fy_start_month)

    tq = db.query(func.min(Transaction.date), func.max(Transaction.date)).filter(
        Transaction.is_categorised.is_(True),
        Transaction.is_excluded.is_(False),
    )
    if user_profile_id is not None:
        tq = tq.filter(Transaction.user_profile_id == user_profile_id)
    min_d, max_d = tq.one()

    years: set[int] = {current_fy}
    if min_d and max_d:
        y0 = fy_start_year_for(min_d, fy_start_month)
        y1 = fy_start_year_for(max_d, fy_start_month)
        for y in range(y0, y1 + 1):
            years.add(y)
    # also include next FY shell if we are near year-end? not needed

    options: list = []
    for y in sorted(years, reverse=True):
        start, end = fy_bounds(date(y, fy_start_month, 1), fy_start_month)
        # has_data: any categorised tx in range
        cq = db.query(func.count(Transaction.id)).filter(
            Transaction.is_categorised.is_(True),
            Transaction.is_excluded.is_(False),
            Transaction.date >= start,
            Transaction.date <= end,
        )
        if user_profile_id is not None:
            cq = cq.filter(Transaction.user_profile_id == user_profile_id)
        count = int(cq.scalar() or 0)
        options.append(
            FinancialYearOption(
                fy_start_year=y,
                label=fy_label(y, fy_start_month),
                date_from=start,
                date_to=end,
                is_current=y == current_fy,
                has_data=count > 0 or y == current_fy,
            )
        )
    return options, current_fy


def build_pl_matrix(
    db: Session,
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
    user_profile_id: Optional[int] = None,
):
    """
    Financial-year P&L matrix:
      - columns: 12 FY months left → right (empty months stay visible)
      - rows: ledgers under Income / Expenses / Transfers
    Defaults to the current FY; year buttons come from FYs that have data.
    """
    from sqlalchemy import extract

    from app.schemas import (
        FinancialYearOption,
        PLMatrixLedgerRow,
        PLMatrixMonthCol,
        PLMatrixReport,
    )

    ref = ref or date.today()
    fy_start_month = int(profile_pref(db, user_profile_id, "fy_start_month", "3"))
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    current_fy = fy_start_year_for(ref, fy_start_month)
    primary_y = int(fy_start_year) if fy_start_year is not None else current_fy

    d_from, d_to = fy_bounds(date(primary_y, fy_start_month, 1), fy_start_month)
    month_keys = fy_month_keys(primary_y, fy_start_month)
    month_index: dict[tuple[int, int], int] = {
        (yy, mm): i for i, (yy, mm) in enumerate(month_keys)
    }

    months = [
        PLMatrixMonthCol(
            month_index=i,
            month=f"{yy:04d}-{mm:02d}",
            month_name=date(yy, mm, 1).strftime("%b"),
            label=date(yy, mm, 1).strftime("%b %Y"),
        )
        for i, (yy, mm) in enumerate(month_keys)
    ]

    # Ledgers for this profile
    lq = db.query(Ledger).filter(Ledger.is_archived.is_(False))
    if user_profile_id is not None:
        lq = lq.filter(Ledger.user_profile_id == user_profile_id)
    ledgers = {lg.id: lg for lg in lq.order_by(Ledger.sort_order, Ledger.name).all()}

    # Aggregate categorised activity by ledger + calendar year/month
    tq = db.query(
        Transaction.ledger_id,
        extract("year", Transaction.date).label("yy"),
        extract("month", Transaction.date).label("mm"),
        func.sum(Transaction.amount).label("total"),
    ).filter(
        Transaction.is_categorised.is_(True),
        Transaction.is_excluded.is_(False),
        Transaction.ledger_id.isnot(None),
        Transaction.date >= d_from,
        Transaction.date <= d_to,
    )
    if user_profile_id is not None:
        tq = tq.filter(Transaction.user_profile_id == user_profile_id)
    rows = tq.group_by(
        Transaction.ledger_id,
        extract("year", Transaction.date),
        extract("month", Transaction.date),
    ).all()

    # ledger_id -> 12 amounts (raw signed totals)
    raw: dict[int, list[Decimal]] = {}
    for r in rows:
        lid = int(r.ledger_id)
        yy, mm = int(r.yy), int(r.mm)
        idx = month_index.get((yy, mm))
        if idx is None:
            continue
        if lid not in raw:
            raw[lid] = [Decimal("0")] * 12
        raw[lid][idx] = quantize_money(Decimal(str(r.total)))

    zero12 = [Decimal("0")] * 12
    income_rows: list[PLMatrixLedgerRow] = []
    expense_rows: list[PLMatrixLedgerRow] = []
    transfer_rows: list[PLMatrixLedgerRow] = []

    for lid, totals in raw.items():
        ledger = ledgers.get(lid)
        if not ledger:
            continue
        # Display amounts by type (expenses as absolute outflow)
        if ledger.type == LedgerType.EXPENSE.value:
            amounts = [quantize_money(abs(v)) for v in totals]
        elif ledger.type == LedgerType.INCOME.value:
            amounts = [quantize_money(v) for v in totals]
        else:
            amounts = [quantize_money(v) for v in totals]

        if all(a == 0 for a in amounts):
            continue

        row = PLMatrixLedgerRow(
            ledger_id=ledger.id,
            ledger_name=ledger.name,
            ledger_type=ledger.type,
            amounts=amounts,
            total=quantize_money(sum(amounts, Decimal("0"))),
        )
        if ledger.type == LedgerType.INCOME.value:
            income_rows.append(row)
        elif ledger.type == LedgerType.EXPENSE.value:
            expense_rows.append(row)
        else:
            # transfer / capital / other → Transfers section
            transfer_rows.append(row)

    income_rows.sort(key=lambda r: r.ledger_name.lower())
    expense_rows.sort(key=lambda r: r.ledger_name.lower())
    transfer_rows.sort(key=lambda r: r.ledger_name.lower())

    def col_sum(section: list[PLMatrixLedgerRow]) -> list[Decimal]:
        out = list(zero12)
        for row in section:
            for i, a in enumerate(row.amounts):
                out[i] = quantize_money(out[i] + a)
        return out

    month_income = col_sum(income_rows)
    month_expense = col_sum(expense_rows)
    month_transfer = col_sum(transfer_rows)
    month_net = [
        quantize_money(month_income[i] - month_expense[i]) for i in range(12)
    ]

    total_income = quantize_money(sum(month_income, Decimal("0")))
    total_expenses = quantize_money(sum(month_expense, Decimal("0")))
    total_transfers = quantize_money(sum(month_transfer, Decimal("0")))
    net_result = quantize_money(total_income - total_expenses)

    # Year buttons: only FYs that actually have categorised data
    all_years, _ = list_financial_years(
        db, fy_start_month, user_profile_id=user_profile_id, ref=ref
    )
    years_with_data: list[FinancialYearOption] = []
    for opt in all_years:
        start, end = opt.date_from, opt.date_to
        cq = db.query(func.count(Transaction.id)).filter(
            Transaction.is_categorised.is_(True),
            Transaction.is_excluded.is_(False),
            Transaction.date >= start,
            Transaction.date <= end,
        )
        if user_profile_id is not None:
            cq = cq.filter(Transaction.user_profile_id == user_profile_id)
        count = int(cq.scalar() or 0)
        if count > 0:
            years_with_data.append(
                FinancialYearOption(
                    fy_start_year=opt.fy_start_year,
                    # Short button label: start year (e.g. 2022)
                    label=str(opt.fy_start_year),
                    date_from=opt.date_from,
                    date_to=opt.date_to,
                    is_current=opt.is_current,
                    has_data=True,
                )
            )

    return PLMatrixReport(
        currency=currency,
        fy_start_month=fy_start_month,
        fy_start_year=primary_y,
        label=fy_label(primary_y, fy_start_month),
        date_from=d_from,
        date_to=d_to,
        is_current_fy=primary_y == current_fy,
        available_years=years_with_data,
        months=months,
        income_rows=income_rows,
        expense_rows=expense_rows,
        transfer_rows=transfer_rows,
        month_income_totals=month_income,
        month_expense_totals=month_expense,
        month_transfer_totals=month_transfer,
        month_net_totals=month_net,
        total_income=total_income,
        total_expenses=total_expenses,
        total_transfers=total_transfers,
        net_result=net_result,
    )


def build_budget_matrix(
    db: Session,
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
    user_profile_id: Optional[int] = None,
):
    """
    Budget vs Actual matrix for one financial year:
      - only ledgers with budget_monthly or budget_annual set
      - each month: Budget | Actual (display amounts)
      - rows: Income / Expenses / Other (if budgeted)
    """
    from sqlalchemy import extract

    from app.schemas import (
        BudgetMatrixLedgerRow,
        BudgetMatrixReport,
        FinancialYearOption,
        PLMatrixMonthCol,
    )

    ref = ref or date.today()
    fy_start_month = int(profile_pref(db, user_profile_id, "fy_start_month", "3"))
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")
    current_fy = fy_start_year_for(ref, fy_start_month)
    primary_y = int(fy_start_year) if fy_start_year is not None else current_fy

    d_from, d_to = fy_bounds(date(primary_y, fy_start_month, 1), fy_start_month)
    month_keys = fy_month_keys(primary_y, fy_start_month)
    month_index: dict[tuple[int, int], int] = {
        (yy, mm): i for i, (yy, mm) in enumerate(month_keys)
    }

    months = [
        PLMatrixMonthCol(
            month_index=i,
            month=f"{yy:04d}-{mm:02d}",
            month_name=date(yy, mm, 1).strftime("%b"),
            label=date(yy, mm, 1).strftime("%b %Y"),
        )
        for i, (yy, mm) in enumerate(month_keys)
    ]

    lq = db.query(Ledger).filter(Ledger.is_archived.is_(False))
    if user_profile_id is not None:
        lq = lq.filter(Ledger.user_profile_id == user_profile_id)
    all_ledgers = list(lq.order_by(Ledger.sort_order, Ledger.name).all())

    # Only ledgers with a preset budget
    budgeted = [
        lg
        for lg in all_ledgers
        if lg.budget_monthly is not None or lg.budget_annual is not None
    ]

    # Actuals by ledger × month
    tq = db.query(
        Transaction.ledger_id,
        extract("year", Transaction.date).label("yy"),
        extract("month", Transaction.date).label("mm"),
        func.sum(Transaction.amount).label("total"),
    ).filter(
        Transaction.is_categorised.is_(True),
        Transaction.is_excluded.is_(False),
        Transaction.ledger_id.isnot(None),
        Transaction.date >= d_from,
        Transaction.date <= d_to,
    )
    if user_profile_id is not None:
        tq = tq.filter(Transaction.user_profile_id == user_profile_id)
    if budgeted:
        tq = tq.filter(Transaction.ledger_id.in_([lg.id for lg in budgeted]))
    rows = tq.group_by(
        Transaction.ledger_id,
        extract("year", Transaction.date),
        extract("month", Transaction.date),
    ).all()

    raw: dict[int, list[Decimal]] = {}
    for r in rows:
        lid = int(r.ledger_id)
        yy, mm = int(r.yy), int(r.mm)
        idx = month_index.get((yy, mm))
        if idx is None:
            continue
        if lid not in raw:
            raw[lid] = [Decimal("0")] * 12
        raw[lid][idx] = quantize_money(Decimal(str(r.total)))

    income_rows: list[BudgetMatrixLedgerRow] = []
    expense_rows: list[BudgetMatrixLedgerRow] = []
    other_rows: list[BudgetMatrixLedgerRow] = []

    for lg in budgeted:
        budgets: list[Decimal] = []
        actuals: list[Decimal] = []
        raw_act = raw.get(lg.id, [Decimal("0")] * 12)
        for i, (yy, mm) in enumerate(month_keys):
            d0 = date(yy, mm, 1)
            d1 = date(yy, mm, monthrange(yy, mm)[1])
            b = _period_budget(lg, d0, d1)
            budgets.append(quantize_money(abs(b) if b is not None else Decimal("0")))
            act = raw_act[i] if i < len(raw_act) else Decimal("0")
            if lg.type == LedgerType.EXPENSE.value:
                actuals.append(quantize_money(abs(act)))
            elif lg.type == LedgerType.INCOME.value:
                actuals.append(quantize_money(act if act > 0 else abs(act) if act != 0 else Decimal("0")))
            else:
                actuals.append(quantize_money(act))

        b_tot = quantize_money(sum(budgets, Decimal("0")))
        a_tot = quantize_money(sum(actuals, Decimal("0")))
        # Expense: under budget → positive variance; Income: over budget (actual > budget) → positive
        if lg.type == LedgerType.INCOME.value:
            var = quantize_money(a_tot - b_tot)
        else:
            var = quantize_money(b_tot - a_tot)

        row = BudgetMatrixLedgerRow(
            ledger_id=lg.id,
            ledger_name=lg.name,
            ledger_type=lg.type,
            budgets=budgets,
            actuals=actuals,
            budget_total=b_tot,
            actual_total=a_tot,
            variance_total=var,
        )
        if lg.type == LedgerType.INCOME.value:
            income_rows.append(row)
        elif lg.type == LedgerType.EXPENSE.value:
            expense_rows.append(row)
        else:
            other_rows.append(row)

    income_rows.sort(key=lambda r: r.ledger_name.lower())
    expense_rows.sort(key=lambda r: r.ledger_name.lower())
    other_rows.sort(key=lambda r: r.ledger_name.lower())

    def col_sum(section: list[BudgetMatrixLedgerRow], field: str) -> list[Decimal]:
        out = [Decimal("0")] * 12
        for row in section:
            vals = getattr(row, field)
            for i, a in enumerate(vals):
                out[i] = quantize_money(out[i] + a)
        return out

    mi_b = col_sum(income_rows, "budgets")
    mi_a = col_sum(income_rows, "actuals")
    me_b = col_sum(expense_rows, "budgets")
    me_a = col_sum(expense_rows, "actuals")

    # Years with data (same as P&L matrix)
    all_years, _ = list_financial_years(
        db, fy_start_month, user_profile_id=user_profile_id, ref=ref
    )
    years_with_data: list[FinancialYearOption] = []
    for opt in all_years:
        cq = db.query(func.count(Transaction.id)).filter(
            Transaction.is_categorised.is_(True),
            Transaction.is_excluded.is_(False),
            Transaction.date >= opt.date_from,
            Transaction.date <= opt.date_to,
        )
        if user_profile_id is not None:
            cq = cq.filter(Transaction.user_profile_id == user_profile_id)
        if int(cq.scalar() or 0) > 0:
            years_with_data.append(
                FinancialYearOption(
                    fy_start_year=opt.fy_start_year,
                    label=str(opt.fy_start_year),
                    date_from=opt.date_from,
                    date_to=opt.date_to,
                    is_current=opt.is_current,
                    has_data=True,
                )
            )

    return BudgetMatrixReport(
        currency=currency,
        fy_start_month=fy_start_month,
        fy_start_year=primary_y,
        label=fy_label(primary_y, fy_start_month),
        date_from=d_from,
        date_to=d_to,
        is_current_fy=primary_y == current_fy,
        available_years=years_with_data,
        months=months,
        income_rows=income_rows,
        expense_rows=expense_rows,
        other_rows=other_rows,
        month_income_budgets=mi_b,
        month_income_actuals=mi_a,
        month_expense_budgets=me_b,
        month_expense_actuals=me_a,
        total_income_budget=quantize_money(sum(mi_b, Decimal("0"))),
        total_income_actual=quantize_money(sum(mi_a, Decimal("0"))),
        total_expense_budget=quantize_money(sum(me_b, Decimal("0"))),
        total_expense_actual=quantize_money(sum(me_a, Decimal("0"))),
    )


def build_monthly_comparison(
    db: Session,
    fy_start_year: Optional[int] = None,
    compare_fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
    user_profile_id: Optional[int] = None,
):
    """
    Full financial-year monthly overview (always 12 months L→R).
    Empty months still appear as zero bars so the FY skeleton is visible.
    Optional compare_fy_start_year overlays a prior FY month-aligned.
    """
    from app.schemas import MonthlyComparisonPoint, MonthlyComparisonReport

    ref = ref or date.today()
    fy_start_month = int(profile_pref(db, user_profile_id, "fy_start_month", "3"))
    currency = profile_pref(db, user_profile_id, "currency", "ZAR")

    available, current_fy = list_financial_years(
        db, fy_start_month, user_profile_id=user_profile_id, ref=ref
    )
    primary_y = int(fy_start_year) if fy_start_year is not None else current_fy
    # Ensure primary year is listed
    if not any(o.fy_start_year == primary_y for o in available):
        start, end = fy_bounds(date(primary_y, fy_start_month, 1), fy_start_month)
        from app.schemas import FinancialYearOption

        available.append(
            FinancialYearOption(
                fy_start_year=primary_y,
                label=fy_label(primary_y, fy_start_month),
                date_from=start,
                date_to=end,
                is_current=primary_y == current_fy,
                has_data=False,
            )
        )
        available.sort(key=lambda o: o.fy_start_year, reverse=True)

    compare_y: Optional[int] = None
    if compare_fy_start_year is not None and int(compare_fy_start_year) != primary_y:
        compare_y = int(compare_fy_start_year)

    lq = db.query(Ledger).filter(Ledger.is_archived.is_(False))
    if user_profile_id is not None:
        lq = lq.filter(Ledger.user_profile_id == user_profile_id)
    ledgers = list(lq.all())

    primary_keys = fy_month_keys(primary_y, fy_start_month)
    compare_keys = fy_month_keys(compare_y, fy_start_month) if compare_y is not None else None

    points: list[MonthlyComparisonPoint] = []
    for idx, (yy, mm) in enumerate(primary_keys):
        d_from = date(yy, mm, 1)
        inc, exp, ib, eb, net = _month_totals(db, yy, mm, ledgers, user_profile_id)
        c_inc = c_exp = c_ib = c_eb = c_net = Decimal("0")
        c_month = None
        c_label = None
        if compare_keys is not None:
            cy, cm = compare_keys[idx]
            c_inc, c_exp, c_ib, c_eb, c_net = _month_totals(
                db, cy, cm, ledgers, user_profile_id
            )
            c_month = f"{cy:04d}-{cm:02d}"
            c_label = date(cy, cm, 1).strftime("%b %Y")

        points.append(
            MonthlyComparisonPoint(
                month_index=idx,
                month=f"{yy:04d}-{mm:02d}",
                month_name=d_from.strftime("%b"),
                label=d_from.strftime("%b %Y"),
                income=inc,
                expenses=exp,
                income_budget=ib,
                expense_budget=eb,
                net=net,
                compare_month=c_month,
                compare_label=c_label,
                compare_income=c_inc,
                compare_expenses=c_exp,
                compare_income_budget=c_ib,
                compare_expense_budget=c_eb,
                compare_net=c_net,
            )
        )

    return MonthlyComparisonReport(
        currency=currency,
        fy_start_month=fy_start_month,
        primary_fy_start_year=primary_y,
        primary_label=fy_label(primary_y, fy_start_month),
        compare_fy_start_year=compare_y,
        compare_label=fy_label(compare_y, fy_start_month) if compare_y is not None else None,
        available_years=available,
        months=points,
        months_count=12,
    )
