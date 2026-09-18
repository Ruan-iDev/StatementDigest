"""Work Flow yearly totals — quotes, invoices, expenses, salaries. Isolated from core reports."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import UserProfile
from app.modules.practice.models import (
    DocumentKind,
    DocumentStatus,
    EntryType,
    PracticeDocument,
    PracticeEntry,
    PracticeExpense,
    PracticeLedger,
    PracticeProject,
    PracticeStaff,
    PracticeWage,
)
from app.modules.practice.schemas import (
    StatementTotals,
    WorkflowOverviewOut,
    WorkflowOverviewPoint,
    WorkflowPLLine,
    WorkflowPLOut,
    WorkflowReportLine,
    WorkflowReportOut,
    WorkflowYearOption,
)
from app.services.money import quantize_money, to_decimal
from app.services.reports import fy_bounds, fy_label, fy_month_keys, fy_start_year_for, profile_pref


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _doc_date(row: PracticeDocument) -> date | None:
    return _as_date(row.issued_on) or _as_date(row.created_at)


def _expense_date(row: PracticeExpense) -> date | None:
    return _as_date(row.incurred_on) or _as_date(row.created_at)


def _wage_date(row: PracticeWage) -> date | None:
    return _as_date(row.occurred_on) or _as_date(row.created_at)


def build_workflow_overview(
    db: Session,
    profile: UserProfile,
    fy_start_year: int | None = None,
) -> WorkflowOverviewOut:
    fy_start_month = int(profile.fy_start_month or profile_pref(db, profile.id, "fy_start_month", "3"))
    currency = profile.currency or profile_pref(db, profile.id, "currency", "ZAR") or "ZAR"
    ref = date.today()
    current_fy = fy_start_year_for(ref, fy_start_month)
    primary_y = int(fy_start_year) if fy_start_year is not None else current_fy
    d_from, d_to = fy_bounds(date(primary_y, fy_start_month, 1), fy_start_month)
    month_keys = fy_month_keys(primary_y, fy_start_month)
    month_index = {(yy, mm): i for i, (yy, mm) in enumerate(month_keys)}

    quotes = [Decimal("0")] * 12
    invoices = [Decimal("0")] * 12
    expenses = [Decimal("0")] * 12
    wages = [Decimal("0")] * 12

    docs = (
        db.query(PracticeDocument)
        .filter(
            PracticeDocument.user_profile_id == profile.id,
            PracticeDocument.is_archived.is_(False),
            PracticeDocument.status != DocumentStatus.VOID.value,
        )
        .all()
    )
    exp_rows = (
        db.query(PracticeExpense)
        .filter(
            PracticeExpense.user_profile_id == profile.id,
            PracticeExpense.is_archived.is_(False),
        )
        .all()
    )
    wage_rows = (
        db.query(PracticeWage)
        .filter(PracticeWage.user_profile_id == profile.id)
        .all()
    )

    years: set[int] = {current_fy}

    def bucket(when: date | None, amount, target: list[Decimal] | None) -> None:
        if when is None:
            return
        years.add(fy_start_year_for(when, fy_start_month))
        if target is None:
            return
        if when < d_from or when > d_to:
            return
        idx = month_index.get((when.year, when.month))
        if idx is None:
            return
        target[idx] = quantize_money(target[idx] + to_decimal(amount or 0))

    for row in docs:
        when = _doc_date(row)
        if row.kind == DocumentKind.QUOTE.value:
            bucket(when, row.amount, quotes)
        elif row.kind == DocumentKind.INVOICE.value:
            bucket(when, row.amount, invoices)
        else:
            bucket(when, 0, None)

    for row in exp_rows:
        bucket(_expense_date(row), row.amount, expenses)

    for row in wage_rows:
        bucket(_wage_date(row), row.amount, wages)

    months = [
        WorkflowOverviewPoint(
            month_index=i,
            month=f"{yy:04d}-{mm:02d}",
            month_name=date(yy, mm, 1).strftime("%b"),
            label=date(yy, mm, 1).strftime("%b %Y"),
            quotes=quantize_money(quotes[i]),
            invoices=quantize_money(invoices[i]),
            expenses=quantize_money(expenses[i]),
            wages=quantize_money(wages[i]),
        )
        for i, (yy, mm) in enumerate(month_keys)
    ]

    options: list[WorkflowYearOption] = []
    for y in sorted(years, reverse=True):
        start, end = fy_bounds(date(y, fy_start_month, 1), fy_start_month)
        options.append(
            WorkflowYearOption(
                fy_start_year=y,
                label=fy_label(y, fy_start_month),
                date_from=start,
                date_to=end,
                is_current=y == current_fy,
                has_data=y == current_fy or y in years,
            )
        )

    return WorkflowOverviewOut(
        currency=currency,
        fy_start_month=fy_start_month,
        primary_fy_start_year=primary_y,
        primary_label=fy_label(primary_y, fy_start_month),
        available_years=options,
        months=months,
        months_count=12,
        totals=StatementTotals(
            quotes=quantize_money(sum(quotes, Decimal("0"))),
            invoices=quantize_money(sum(invoices, Decimal("0"))),
            expenses=quantize_money(sum(expenses, Decimal("0"))),
            wages=quantize_money(sum(wages, Decimal("0"))),
            net=quantize_money(
                sum(invoices, Decimal("0")) - sum(expenses, Decimal("0")) - sum(wages, Decimal("0"))
            ),
        ),
    )


def _payment_date(row: PracticeEntry) -> date | None:
    return _as_date(getattr(row, "occurred_on", None)) or _as_date(row.created_at)


def _sort_lines(rows: list[WorkflowReportLine]) -> list[WorkflowReportLine]:
    return sorted(rows, key=lambda r: (r.occurred_on or date.min, r.id), reverse=True)


def build_workflow_report(
    db: Session,
    profile: UserProfile,
    fy_start_year: int | None = None,
) -> WorkflowReportOut:
    fy_start_month = int(profile.fy_start_month or profile_pref(db, profile.id, "fy_start_month", "3"))
    currency = profile.currency or profile_pref(db, profile.id, "currency", "ZAR") or "ZAR"
    ref = date.today()
    current_fy = fy_start_year_for(ref, fy_start_month)
    primary_y = int(fy_start_year) if fy_start_year is not None else current_fy
    d_from, d_to = fy_bounds(date(primary_y, fy_start_month, 1), fy_start_month)

    years: set[int] = {current_fy}

    def in_year(when: date | None) -> bool:
        if when is None:
            return False
        years.add(fy_start_year_for(when, fy_start_month))
        return d_from <= when <= d_to

    docs = (
        db.query(PracticeDocument)
        .filter(
            PracticeDocument.user_profile_id == profile.id,
            PracticeDocument.is_archived.is_(False),
            PracticeDocument.status != DocumentStatus.VOID.value,
        )
        .all()
    )
    exp_rows = (
        db.query(PracticeExpense)
        .filter(
            PracticeExpense.user_profile_id == profile.id,
            PracticeExpense.is_archived.is_(False),
        )
        .all()
    )
    pay_rows = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.user_profile_id == profile.id,
            PracticeEntry.entry_type == EntryType.PAYMENT.value,
        )
        .all()
    )
    wage_rows = (
        db.query(PracticeWage)
        .filter(PracticeWage.user_profile_id == profile.id)
        .all()
    )

    quotes: list[WorkflowReportLine] = []
    invoices: list[WorkflowReportLine] = []
    expenses: list[WorkflowReportLine] = []
    payments: list[WorkflowReportLine] = []
    wages: list[WorkflowReportLine] = []

    for row in docs:
        when = _doc_date(row)
        if not in_year(when):
            continue
        party = getattr(row, "party", None)
        project = getattr(row, "project", None)
        line = WorkflowReportLine(
            id=row.id,
            kind=row.kind,
            occurred_on=when,
            number=row.number,
            title=row.title,
            client_name=party.name if party else None,
            project_id=row.project_id,
            project_name=project.name if project else None,
            document_id=row.id,
            status=row.status,
            amount=quantize_money(row.amount),
        )
        if row.kind == DocumentKind.QUOTE.value:
            quotes.append(line)
        elif row.kind == DocumentKind.INVOICE.value:
            invoices.append(line)

    for row in exp_rows:
        when = _expense_date(row)
        if not in_year(when):
            continue
        project = getattr(row, "project", None)
        client = getattr(project, "client", None) if project else None
        vendor = (getattr(row, "vendor_name", None) or "").strip()
        expenses.append(
            WorkflowReportLine(
                id=row.id,
                kind="expense",
                occurred_on=when,
                title=f"{row.description} · {vendor}" if vendor else row.description,
                client_name=client.name if client else None,
                project_id=row.project_id,
                project_name=project.name if project else None,
                amount=quantize_money(row.amount),
            )
        )

    for row in pay_rows:
        when = _payment_date(row)
        if not in_year(when):
            continue
        project = getattr(row, "project", None)
        client = getattr(project, "client", None) if project else None
        payments.append(
            WorkflowReportLine(
                id=row.id,
                kind="payment",
                occurred_on=when,
                title=row.title,
                client_name=client.name if client else None,
                project_id=row.project_id,
                project_name=project.name if project else None,
                document_id=row.document_id,
                amount=quantize_money(row.amount or 0),
            )
        )

    for row in wage_rows:
        when = _wage_date(row)
        if not in_year(when):
            continue
        staff = db.get(PracticeStaff, row.staff_id)
        project = db.get(PracticeProject, row.project_id)
        wages.append(
            WorkflowReportLine(
                id=row.id,
                kind="wage",
                occurred_on=when,
                title=f"Wages · {staff.name}" if staff else "Wages",
                client_name=staff.name if staff else None,
                project_id=row.project_id,
                project_name=project.name if project else None,
                amount=quantize_money(row.amount),
            )
        )

    options: list[WorkflowYearOption] = []
    for y in sorted(years, reverse=True):
        start, end = fy_bounds(date(y, fy_start_month, 1), fy_start_month)
        options.append(
            WorkflowYearOption(
                fy_start_year=y,
                label=fy_label(y, fy_start_month),
                date_from=start,
                date_to=end,
                is_current=y == current_fy,
                has_data=y == current_fy or y in years,
            )
        )

    ledger_rows = (
        db.query(PracticeLedger)
        .filter(PracticeLedger.user_profile_id == profile.id)
        .all()
    )
    ledgers = {row.id: row.name for row in ledger_rows}
    ledger_types = {row.id: row.type for row in ledger_rows}

    def _add_pl(bucket: dict[int | None, list], ledger_id: int | None, amount: Decimal) -> None:
        slot = bucket.setdefault(ledger_id, [Decimal("0"), 0])
        slot[0] += amount
        slot[1] += 1

    income_pl: dict[int | None, list] = {}
    expense_pl: dict[int | None, list] = {}
    for row in docs:
        when = _doc_date(row)
        if not in_year(when):
            continue
        if row.kind == DocumentKind.INVOICE.value:
            _add_pl(income_pl, row.income_ledger_id, to_decimal(row.amount))
    for row in exp_rows:
        when = _expense_date(row)
        if not in_year(when):
            continue
        _add_pl(expense_pl, row.ledger_id, to_decimal(row.amount))
    for row in wage_rows:
        when = _wage_date(row)
        if not in_year(when):
            continue
        amt = to_decimal(row.amount)
        if amt == 0:
            continue
        _add_pl(expense_pl, getattr(row, "ledger_id", None), amt)
    for row in pay_rows:
        when = _payment_date(row)
        if not in_year(when):
            continue
        lid = getattr(row, "ledger_id", None)
        if not lid:
            continue
        amt = to_decimal(row.amount)
        kind = ledger_types.get(lid)
        if kind == "expense":
            _add_pl(expense_pl, lid, -amt)
        elif kind == "income":
            _add_pl(income_pl, lid, amt)

    def _pl_lines(bucket: dict[int | None, list]) -> list[WorkflowPLLine]:
        lines: list[WorkflowPLLine] = []
        for lid, (amt, count) in bucket.items():
            name = ledgers.get(lid) if lid is not None else None
            lines.append(
                WorkflowPLLine(
                    ledger_id=lid,
                    ledger_name=name or "Unassigned",
                    amount=quantize_money(amt),
                    count=int(count),
                )
            )
        lines.sort(key=lambda r: (r.ledger_name == "Unassigned", r.ledger_name.lower()))
        return lines

    income_lines = _pl_lines(income_pl)
    expense_lines = _pl_lines(expense_pl)
    income_total = sum((r.amount for r in income_lines), Decimal("0"))
    expense_total = sum((r.amount for r in expense_lines), Decimal("0"))

    q_total = sum((r.amount for r in quotes), Decimal("0"))
    i_total = sum((r.amount for r in invoices), Decimal("0"))
    e_total = sum((r.amount for r in expenses), Decimal("0"))
    p_total = sum((r.amount for r in payments), Decimal("0"))
    w_total = sum((r.amount for r in wages), Decimal("0"))

    return WorkflowReportOut(
        currency=currency,
        fy_start_month=fy_start_month,
        primary_fy_start_year=primary_y,
        primary_label=fy_label(primary_y, fy_start_month),
        date_from=d_from,
        date_to=d_to,
        available_years=options,
        quotes=_sort_lines(quotes),
        invoices=_sort_lines(invoices),
        payments=_sort_lines(payments),
        expenses=_sort_lines(expenses),
        wages=_sort_lines(wages),
        totals=StatementTotals(
            quotes=quantize_money(q_total),
            invoices=quantize_money(i_total),
            expenses=quantize_money(e_total),
            wages=quantize_money(w_total),
            net=quantize_money(i_total - e_total - w_total),
            payments=quantize_money(p_total),
        ),
        pl=WorkflowPLOut(
            income=income_lines,
            expenses=expense_lines,
            income_total=quantize_money(income_total),
            expense_total=quantize_money(expense_total),
            net=quantize_money(income_total - expense_total),
        ),
    )
