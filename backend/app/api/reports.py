from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile, get_active_profile_id
from app.models import UserProfile
from app.schemas import (
    BudgetMatrixReport,
    MonthlyComparisonReport,
    PLMatrixReport,
    PLReport,
    SaReportCatalogItem,
    SaSupportReport,
)
from app.services.letterhead import letterhead_from_profile
from app.services.pdf_report import (
    generate_monthly_overview_pdf,
    generate_period_report_pdf,
    generate_pl_matrix_pdf,
    generate_sa_support_pdf,
)
from app.services.reports import (
    build_budget_matrix,
    build_monthly_comparison,
    build_pl_matrix,
    build_pl_report,
)
from app.services.sa_tax_reports import (
    REPORT_BUILDERS,
    build_capital_schedule,
    build_cashflow_indirect,
    build_consolidation_stub,
    build_fy_pack,
    build_general_ledger,
    build_interest_summary,
    build_irp5_emp201_stub,
    build_medical_credit,
    build_provisional_tax,
    build_related_party,
    build_taxable_income,
    build_travel_motor,
    build_trial_balance,
    build_vat_201,
    report_catalog,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _sa_params(
    fy_start_year: Optional[int],
    period: str,
    date_from: Optional[date],
    date_to: Optional[date],
    ref: Optional[date],
) -> dict:
    return {
        "fy_start_year": fy_start_year,
        "period": period,
        "date_from": date_from,
        "date_to": date_to,
        "ref": ref,
    }


@router.get("/pl", response_model=PLReport)
def profit_and_loss(
    period: str = Query("monthly", description="monthly | financial_year | last_12_months | custom"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    months: Optional[str] = Query(
        None,
        description="Comma-separated YYYY-MM months to include (non-contiguous OK). "
        "When set, only those months are aggregated.",
    ),
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """P&L report. Zero-value ledgers are omitted."""
    return build_pl_report(
        db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        ref=ref,
        user_profile_id=profile_id,
        months=months,
    )


@router.get("/pl-matrix", response_model=PLMatrixReport)
def profit_and_loss_matrix(
    fy_start_year: Optional[int] = Query(
        None,
        description="Financial year start year (e.g. 2022 for SA Mar 2022–Feb 2023). Default: current FY.",
    ),
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Full financial-year P&L: 12 months L→R, ledgers T→B (Income / Expenses / Transfers)."""
    return build_pl_matrix(
        db,
        fy_start_year=fy_start_year,
        ref=ref,
        user_profile_id=profile_id,
    )


@router.get("/budget-matrix", response_model=BudgetMatrixReport)
def budget_vs_actual_matrix(
    fy_start_year: Optional[int] = Query(
        None,
        description="Financial year start year. Default: current FY.",
    ),
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Budget vs Actual matrix: only ledgers with a budget; dual columns Budget | Actual per month."""
    return build_budget_matrix(
        db,
        fy_start_year=fy_start_year,
        ref=ref,
        user_profile_id=profile_id,
    )


@router.get("/monthly-comparison", response_model=MonthlyComparisonReport)
def monthly_comparison(
    fy_start_year: Optional[int] = Query(
        None, description="Financial year start year (e.g. 2025 for SA Mar 2025–Feb 2026)"
    ),
    compare_fy_start_year: Optional[int] = Query(
        None, description="Optional second FY to overlay for year-on-year comparison"
    ),
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Financial-year monthly chart: always 12 months L→R (empty months stay on the axis)."""
    return build_monthly_comparison(
        db,
        fy_start_year=fy_start_year,
        compare_fy_start_year=compare_fy_start_year,
        ref=ref,
        user_profile_id=profile_id,
    )


@router.get("/pl/pdf")
def profit_and_loss_pdf(
    fy_start_year: Optional[int] = Query(
        None,
        description="Financial year start year for the matrix PDF (matches on-screen P&L). "
        "If omitted, uses current FY matrix.",
    ),
    # Period reports (turnover, expenses, cashflow, budget list, classic pl)
    report_type: Optional[str] = Query(
        None,
        description="turnover | expenses | budget | cashflow | pl — shapes the period PDF body",
    ),
    period: Optional[str] = Query(None),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    months: Optional[str] = Query(
        None, description="Comma-separated YYYY-MM for classic period PDF"
    ),
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    """Export report PDF: matrix P&amp;L, or type-specific period PDF (turnover/expenses/…)."""
    lh = letterhead_from_profile(profile)
    rtype = (report_type or "").strip().lower()

    # Period-style reports (and typed exports) use classic PL data + typed layout
    use_period = (
        rtype in {"turnover", "expenses", "budget", "cashflow", "pl"}
        or months is not None
        or period in (
            "custom",
            "last_12_months",
            "l12m",
            "monthly",
            "financial_year",
            "fy",
        )
    )
    # Pure matrix: fy only, no report_type period kinds, no months
    use_matrix = not use_period or (
        rtype in {"", "matrix", "pl-matrix"}
        and months is None
        and period in (None, "", "matrix")
        and rtype not in {"turnover", "expenses", "budget", "cashflow", "pl"}
    )
    if rtype in {"turnover", "expenses", "budget", "cashflow", "pl"}:
        use_matrix = False
        use_period = True

    if use_period and not use_matrix:
        report = build_pl_report(
            db,
            period=period or ("custom" if (date_from or months) else "monthly"),
            date_from=date_from,
            date_to=date_to,
            ref=ref,
            user_profile_id=profile.id,
            months=months,
        )
        kind = rtype if rtype in {"turnover", "expenses", "budget", "cashflow", "pl"} else "pl"
        pdf_bytes = generate_period_report_pdf(report, report_type=kind, letterhead=lh)
        slug = {
            "turnover": "Turnover",
            "expenses": "Expense_Summary",
            "budget": "Budget_vs_Actual",
            "cashflow": "Cashflow",
            "pl": "PL",
        }.get(kind, "Report")
        filename = f"{slug}_{report.date_from}_{report.date_to}.pdf"
    else:
        matrix = build_pl_matrix(
            db,
            fy_start_year=fy_start_year,
            ref=ref,
            user_profile_id=profile.id,
        )
        pdf_bytes = generate_pl_matrix_pdf(matrix, letterhead=lh)
        safe_label = matrix.label.replace("/", "-").replace(" ", "_")
        filename = f"PL_{safe_label}_{matrix.date_from}_{matrix.date_to}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/monthly-comparison/pdf")
def monthly_comparison_pdf(
    fy_start_year: Optional[int] = Query(
        None, description="Financial year start year (e.g. 2022). Default: current FY."
    ),
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    """Landscape A4 monthly overview PDF (Income · Spending · Budget) for meetings."""
    report = build_monthly_comparison(
        db,
        fy_start_year=fy_start_year,
        compare_fy_start_year=None,
        ref=ref,
        user_profile_id=profile.id,
    )
    lh = letterhead_from_profile(profile)
    pdf_bytes = generate_monthly_overview_pdf(report, letterhead=lh)
    safe = report.primary_label.replace("/", "-").replace(" ", "_")
    filename = f"Monthly_Overview_{safe}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── SA tax & accounting support reports ───────────────────────────────────


@router.get("/catalog", response_model=list[SaReportCatalogItem])
def sa_report_catalog():
    """List SA support reports (individual / companies / cross-cutting)."""
    return [SaReportCatalogItem(**item) for item in report_catalog()]


@router.get("/taxable-income", response_model=SaSupportReport)
def taxable_income_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_taxable_income(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/interest-summary", response_model=SaSupportReport)
def interest_summary_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_interest_summary(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/medical-credit", response_model=SaSupportReport)
def medical_credit_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_medical_credit(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/travel-motor", response_model=SaSupportReport)
def travel_motor_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_travel_motor(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/capital-schedule", response_model=SaSupportReport)
def capital_schedule_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_capital_schedule(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/provisional-tax", response_model=SaSupportReport)
def provisional_tax_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_provisional_tax(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/vat-201", response_model=SaSupportReport)
def vat_201_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_vat_201(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/irp5-emp201", response_model=SaSupportReport)
def irp5_emp201_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_irp5_emp201_stub(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/related-party", response_model=SaSupportReport)
def related_party_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_related_party(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/trial-balance", response_model=SaSupportReport)
def trial_balance_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_trial_balance(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/general-ledger", response_model=SaSupportReport)
def general_ledger_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    ledger_id: Optional[int] = Query(None, description="Optional single ledger focus"),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_general_ledger(
        db,
        profile_id,
        ledger_id=ledger_id,
        **_sa_params(fy_start_year, period, date_from, date_to, ref),
    )


@router.get("/cashflow-indirect", response_model=SaSupportReport)
def cashflow_indirect_report(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_cashflow_indirect(db, profile_id, **_sa_params(fy_start_year, period, date_from, date_to, ref))


@router.get("/fy-pack", response_model=SaSupportReport)
def fy_pack_report(
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_fy_pack(db, profile_id, fy_start_year=fy_start_year, ref=ref)


@router.get("/consolidation", response_model=SaSupportReport)
def consolidation_report(
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return build_consolidation_stub(db, profile_id, fy_start_year=fy_start_year, ref=ref)


@router.get("/sa/{report_key}/pdf")
def sa_support_pdf(
    report_key: str,
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    ledger_id: Optional[int] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    """PDF export for any SA support report key."""
    key = (report_key or "").strip().lower()
    builder = REPORT_BUILDERS.get(key)
    if not builder:
        return Response(content=b"Unknown report", status_code=404)
    kwargs = _sa_params(fy_start_year, period, date_from, date_to, ref)
    if key == "general-ledger":
        report = builder(db, profile.id, ledger_id=ledger_id, **kwargs)
    elif key in ("fy-pack", "consolidation"):
        report = builder(db, profile.id, fy_start_year=fy_start_year, ref=ref)
    else:
        report = builder(db, profile.id, **kwargs)
    lh = letterhead_from_profile(profile)
    pdf_bytes = generate_sa_support_pdf(report, letterhead=lh)
    safe = report.title.replace(" ", "_").replace("/", "-")
    filename = f"{safe}_{report.date_from}_{report.date_to}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Convenience aliases for priority PDFs
@router.get("/trial-balance/pdf")
def trial_balance_pdf(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return sa_support_pdf(
        "trial-balance",
        fy_start_year,
        period,
        date_from,
        date_to,
        ref,
        None,
        db,
        profile,
    )


@router.get("/related-party/pdf")
def related_party_pdf(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return sa_support_pdf(
        "related-party",
        fy_start_year,
        period,
        date_from,
        date_to,
        ref,
        None,
        db,
        profile,
    )


@router.get("/interest-summary/pdf")
def interest_summary_pdf(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return sa_support_pdf(
        "interest-summary",
        fy_start_year,
        period,
        date_from,
        date_to,
        ref,
        None,
        db,
        profile,
    )


@router.get("/taxable-income/pdf")
def taxable_income_pdf(
    fy_start_year: Optional[int] = None,
    period: str = Query("financial_year"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return sa_support_pdf(
        "taxable-income",
        fy_start_year,
        period,
        date_from,
        date_to,
        ref,
        None,
        db,
        profile,
    )


@router.get("/fy-pack/pdf")
def fy_pack_pdf(
    fy_start_year: Optional[int] = None,
    ref: Optional[date] = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return sa_support_pdf(
        "fy-pack",
        fy_start_year,
        "financial_year",
        None,
        None,
        ref,
        None,
        db,
        profile,
    )
