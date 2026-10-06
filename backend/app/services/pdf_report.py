"""P&L PDF generation via ReportLab (Windows-friendly; no GTK deps).

Business profiles may include a logo + contact block as a professional letterhead.
"""

from __future__ import annotations

import io
from decimal import Decimal
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.graphics.shapes import Circle, Drawing, Line, Rect, String
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas import MonthlyComparisonReport, PLMatrixReport, PLReport
from app.services.letterhead import PdfLetterhead


def _currency_symbol(code: str) -> str:
    """Match on-screen symbols (ZAR → R, USD → $, …)."""
    overrides = {
        "ZAR": "R",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "NAD": "N$",
        "BWP": "P",
        "AUD": "A$",
        "CAD": "C$",
        "JPY": "¥",
        "CNY": "¥",
        "INR": "₹",
        "CHF": "CHF",
    }
    return overrides.get((code or "ZAR").upper(), (code or "ZAR").upper())


def _money(v: Decimal | None, currency: str = "ZAR") -> str:
    if v is None:
        return "—"
    sign = "-" if v < 0 else ""
    return f"{sign}{currency} {abs(v):,.2f}"


def _money_compact(v: Decimal | None, blank_zero: bool = True) -> str:
    """Condensed accounting number (no symbol). Negatives as (1,234.56)."""
    if v is None:
        return ""
    if blank_zero and v == 0:
        return ""
    abs_s = f"{abs(v):,.2f}"
    return f"({abs_s})" if v < 0 else abs_s


def _traffic_color(light: str):
    return {
        "green": colors.HexColor("#16a34a"),
        "amber": colors.HexColor("#d97706"),
        "red": colors.HexColor("#dc2626"),
        "none": colors.HexColor("#64748b"),
    }.get(light, colors.HexColor("#64748b"))


def _letterhead_flowables(letterhead: PdfLetterhead, page_width: float) -> list:
    """Professional letterhead: logo left, identity + contact right, rule below."""
    styles = getSampleStyleSheet()
    name_style = ParagraphStyle(
        "LHName",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=colors.HexColor("#0f172a"),
        leading=16,
        alignment=TA_LEFT,
    )
    sub_style = ParagraphStyle(
        "LHSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#64748b"),
        leading=11,
        alignment=TA_LEFT,
    )
    meta_style = ParagraphStyle(
        "LHMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#475569"),
        leading=11,
        alignment=TA_LEFT,
    )

    logo_cell: object = ""
    if letterhead.logo_abs_path and letterhead.logo_abs_path.is_file():
        try:
            # Fit inside ~28×16 mm box, preserve aspect
            img = Image(str(letterhead.logo_abs_path))
            max_w, max_h = 28 * mm, 16 * mm
            iw, ih = float(img.imageWidth), float(img.imageHeight)
            if iw > 0 and ih > 0:
                scale = min(max_w / iw, max_h / ih)
                img.drawWidth = iw * scale
                img.drawHeight = ih * scale
            else:
                img.drawWidth = max_w
                img.drawHeight = max_h
            logo_cell = img
        except Exception:
            logo_cell = ""

    text_bits = [Paragraph(_escape(letterhead.title_name), name_style)]
    if letterhead.subtitle:
        text_bits.append(Paragraph(_escape(letterhead.subtitle), sub_style))
    for line in letterhead.lines:
        text_bits.append(Paragraph(_escape(line), meta_style))

    text_table = Table([[b] for b in text_bits], colWidths=[page_width - 36 * mm])
    text_table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )

    header = Table(
        [[logo_cell, text_table]],
        colWidths=[32 * mm, page_width - 32 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 6),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )

    return [
        header,
        Spacer(1, 4),
        HRFlowable(
            width="100%",
            thickness=1.1,
            color=colors.HexColor("#0f172a"),
            spaceBefore=2,
            spaceAfter=2,
        ),
        HRFlowable(
            width="100%",
            thickness=0.4,
            color=colors.HexColor("#94a3b8"),
            spaceBefore=0,
            spaceAfter=10,
        ),
    ]


def _escape(s: str) -> str:
    return (
        (s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _period_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "TitleCustom",
            parent=styles["Heading1"],
            fontSize=14,
            spaceAfter=4,
            textColor=colors.HexColor("#0f172a"),
        ),
        "subtitle": ParagraphStyle(
            "SubCustom",
            parent=styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#475569"),
            spaceAfter=12,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=styles["Heading2"],
            fontSize=11,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=10,
            spaceAfter=6,
        ),
        "footer": ParagraphStyle(
            "Footer",
            parent=styles["Normal"],
            fontSize=8,
            textColor=colors.HexColor("#94a3b8"),
            alignment=TA_CENTER,
        ),
        "normal": styles["Normal"],
        "highlight": ParagraphStyle(
            "Highlight",
            parent=styles["Normal"],
            fontSize=16,
            fontName="Helvetica-Bold",
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=8,
        ),
    }


def _simple_amount_table(
    lines,
    total_label: str,
    total: Decimal,
    currency: str,
    *,
    with_budget: bool = False,
) -> list:
    """Compact ledger table: Ledger | Amount [ | Budget | Variance | % | Status ]."""
    if not lines:
        styles = getSampleStyleSheet()
        return [Paragraph("<i>No activity in this section.</i>", styles["Normal"]), Spacer(1, 6)]

    if with_budget:
        data = [["Ledger", "Actual", "Budget", "Variance", "% Budget", "Status"]]
        for line in lines:
            data.append(
                [
                    line.ledger_name,
                    _money(line.amount, currency),
                    _money(line.budget, currency) if line.budget is not None else "—",
                    _money(line.variance, currency) if line.variance is not None else "—",
                    f"{line.budget_pct:.0f}%" if line.budget_pct is not None else "—",
                    line.traffic_light.upper() if line.traffic_light != "none" else "—",
                ]
            )
        data.append([total_label, _money(total, currency), "", "", "", ""])
        col_widths = [70 * mm, 28 * mm, 28 * mm, 28 * mm, 18 * mm, 18 * mm]
        status_col = 5
    else:
        data = [["Ledger", "Amount"]]
        for line in lines:
            data.append([line.ledger_name, _money(line.amount, currency)])
        data.append([total_label, _money(total, currency)])
        col_widths = [120 * mm, 50 * mm]
        status_col = None

    table = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#334155")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.7, colors.HexColor("#0f172a")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.45, colors.HexColor("#0f172a")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.HexColor("#cbd5e1")),
    ]
    if status_col is not None:
        for i, line in enumerate(lines, start=1):
            style_cmds.append(
                ("TEXTCOLOR", (status_col, i), (status_col, i), _traffic_color(line.traffic_light))
            )
    table.setStyle(TableStyle(style_cmds))
    return [table, Spacer(1, 4)]


def generate_period_report_pdf(
    report: PLReport,
    report_type: str = "pl",
    letterhead: Optional[PdfLetterhead] = None,
) -> bytes:
    """Portrait A4 PDF tailored to each on-screen report type.

    report_type:
      turnover | expenses | budget | cashflow | pl
    """
    rtype = (report_type or "pl").strip().lower()
    titles = {
        "turnover": "Turnover Statement",
        "expenses": "Expense Summary",
        "budget": "Budget vs Actual",
        "cashflow": "Cashflow Snapshot",
        "pl": "Profit & Loss Statement",
    }
    title = titles.get(rtype, titles["pl"])
    sym = _currency_symbol(report.currency)

    buffer = io.BytesIO()
    page_w, _page_h = A4
    usable_w = page_w - 30 * mm

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=12 * mm if letterhead else 15 * mm,
        bottomMargin=15 * mm,
        title=f"{title} – {report.period_label}",
    )
    st = _period_styles()
    story: list = []
    if letterhead:
        story.extend(_letterhead_flowables(letterhead, usable_w))

    story.append(Paragraph(_escape(title), st["title"]))
    story.append(
        Paragraph(
            f"Period: <b>{_escape(report.period_label)}</b> &nbsp;|&nbsp; "
            f"{report.date_from.isoformat()} to {report.date_to.isoformat()} &nbsp;|&nbsp; "
            f"Amounts in <b>{_escape(sym)}</b> ({_escape(report.currency)})",
            st["subtitle"],
        )
    )

    if rtype == "turnover":
        story.append(
            Paragraph(
                f"Gross turnover: {_escape(_money(report.total_income, report.currency))}",
                st["highlight"],
            )
        )
        story.append(Paragraph("Income / receipts by ledger", st["section"]))
        story.extend(
            _simple_amount_table(
                report.income_lines,
                "Total turnover",
                report.total_income,
                report.currency,
                with_budget=False,
            )
        )

    elif rtype == "expenses":
        story.append(
            Paragraph(
                f"Total expenses: {_escape(_money(report.total_expenses, report.currency))}",
                st["highlight"],
            )
        )
        story.append(Paragraph("Expenses by ledger", st["section"]))
        story.extend(
            _simple_amount_table(
                report.expense_lines,
                "Total expenses",
                report.total_expenses,
                report.currency,
                with_budget=False,
            )
        )

    elif rtype == "budget":
        budget_lines = [
            ln
            for ln in [*report.income_lines, *report.expense_lines, *report.other_lines]
            if ln.budget is not None
        ]
        if not budget_lines:
            story.append(
                Paragraph(
                    "<i>No budgets set for active ledgers in this period.</i>",
                    st["normal"],
                )
            )
        else:
            story.append(Paragraph("Budget vs actual (ledgers with budgets)", st["section"]))
            story.extend(
                _simple_amount_table(
                    budget_lines,
                    "Expense total (context)",
                    report.total_expenses,
                    report.currency,
                    with_budget=True,
                )
            )

    elif rtype == "cashflow":
        # Summary tiles
        sum_data = [
            ["Inflows (income)", _money(report.total_income, report.currency)],
            ["Outflows (expenses)", _money(report.total_expenses, report.currency)],
            ["Net cash movement", _money(report.net_result, report.currency)],
        ]
        sum_table = Table(sum_data, colWidths=[100 * mm, 70 * mm])
        net_color = (
            colors.HexColor("#16a34a") if report.net_result >= 0 else colors.HexColor("#dc2626")
        )
        sum_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ecfdf5")),
                    ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#fdf2f8")),
                    ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 2), (0, 2), colors.white),
                    ("TEXTCOLOR", (1, 2), (1, 2), net_color),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
                ]
            )
        )
        story.append(sum_table)
        story.append(Spacer(1, 10))
        if report.income_lines:
            story.append(Paragraph("Inflows by ledger", st["section"]))
            story.extend(
                _simple_amount_table(
                    report.income_lines,
                    "Total inflows",
                    report.total_income,
                    report.currency,
                )
            )
        if report.expense_lines:
            story.append(Paragraph("Outflows by ledger", st["section"]))
            story.extend(
                _simple_amount_table(
                    report.expense_lines,
                    "Total outflows",
                    report.total_expenses,
                    report.currency,
                )
            )
        if report.other_lines:
            other_total = sum((x.amount for x in report.other_lines), Decimal("0"))
            story.append(Paragraph("Transfers / capital / other", st["section"]))
            story.extend(
                _simple_amount_table(
                    report.other_lines,
                    "Total other movements",
                    other_total,
                    report.currency,
                )
            )

    else:
        # Full classic P&L
        story.append(Paragraph("Income", st["section"]))
        story.extend(
            _simple_amount_table(
                report.income_lines,
                "Total Income",
                report.total_income,
                report.currency,
                with_budget=True,
            )
        )
        story.append(Paragraph("Expenses", st["section"]))
        story.extend(
            _simple_amount_table(
                report.expense_lines,
                "Total Expenses",
                report.total_expenses,
                report.currency,
                with_budget=True,
            )
        )
        if report.other_lines:
            other_total = sum((x.amount for x in report.other_lines), Decimal("0"))
            story.append(Paragraph("Transfers / Capital / Other", st["section"]))
            story.extend(
                _simple_amount_table(
                    report.other_lines,
                    "Total Other",
                    other_total,
                    report.currency,
                    with_budget=True,
                )
            )
        net_color = (
            colors.HexColor("#16a34a") if report.net_result >= 0 else colors.HexColor("#dc2626")
        )
        net_table = Table(
            [["Net Profit / (Loss)", _money(report.net_result, report.currency)]],
            colWidths=[130 * mm, 60 * mm],
        )
        net_table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 11),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (0, 0), colors.white),
                    ("TEXTCOLOR", (1, 0), (1, 0), net_color),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(Spacer(1, 12))
        story.append(net_table)

    story.append(Spacer(1, 16))
    story.append(
        Paragraph(
            f"Generated locally by LedgerFlow · {title} · Not financial advice",
            st["footer"],
        )
    )
    doc.build(story)
    return buffer.getvalue()


def generate_pl_pdf(
    report: PLReport,
    letterhead: Optional[PdfLetterhead] = None,
) -> bytes:
    """Backward-compatible full P&amp;L PDF."""
    return generate_period_report_pdf(report, report_type="pl", letterhead=letterhead)

def generate_pl_matrix_pdf(
    report: PLMatrixReport,
    letterhead: Optional[PdfLetterhead] = None,
) -> bytes:
    """Portrait A4 P&amp;L matrix matching the on-screen layout: months L→R, ledgers T→B.

    Condensed light-grey spreadsheet styling so a typical year fits on one page.
    """
    buffer = io.BytesIO()
    page_w, page_h = A4
    # Tight margins to maximise columns on one portrait sheet
    margin_x = 7 * mm
    margin_y = 8 * mm
    usable_w = page_w - 2 * margin_x

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,  # portrait
        leftMargin=margin_x,
        rightMargin=margin_x,
        topMargin=margin_y if not letterhead else 6 * mm,
        bottomMargin=7 * mm,
        title=f"Profit & Loss – {report.label}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "PLMxTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#0f172a"),
        leading=12,
        spaceAfter=1,
    )
    meta_style = ParagraphStyle(
        "PLMxMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        textColor=colors.HexColor("#64748b"),
        leading=9,
        spaceAfter=4,
    )
    footer_style = ParagraphStyle(
        "PLMxFooter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=6,
        textColor=colors.HexColor("#94a3b8"),
        alignment=TA_CENTER,
    )
    cell_ledger = ParagraphStyle(
        "PLMxLedger",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=5.5,
        leading=6.5,
        textColor=colors.HexColor("#0f172a"),
    )
    cell_section = ParagraphStyle(
        "PLMxSection",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=6,
        leading=7,
        textColor=colors.HexColor("#334155"),
    )

    story: list = []
    if letterhead:
        # Compact letterhead — save vertical space for the matrix
        story.extend(_letterhead_flowables(letterhead, usable_w))
        # Shrink spacing after letterhead rules a bit by not adding extra spacers

    sym = _currency_symbol(report.currency)
    story.append(Paragraph("Profit &amp; Loss Statement", title_style))
    story.append(
        Paragraph(
            f"<b>{_escape(report.label)}</b> &nbsp;·&nbsp; "
            f"{report.date_from.isoformat()} → {report.date_to.isoformat()} &nbsp;·&nbsp; "
            f"Amounts in <b>{_escape(sym)}</b> ({_escape(report.currency)}) &nbsp;·&nbsp; "
            f"Months left → right · Ledgers top → bottom",
            meta_style,
        )
    )

    months = report.months  # 12
    n_amt = len(months) + 1  # months + total
    ledger_w = 28 * mm
    amt_w = (usable_w - ledger_w) / n_amt
    col_widths = [ledger_w] + [amt_w] * n_amt

    # Header row: Ledger | Mar | Apr | … | Total
    header = ["Ledger"] + [m.month_name for m in months] + ["Total"]
    data: list[list] = [header]
    row_kinds: list[str] = ["header"]  # header | section | data | total | net

    def add_section(
        title: str,
        rows,
        month_totals: list,
        section_total: Decimal,
    ) -> None:
        data.append([Paragraph(title.upper(), cell_section)] + [""] * n_amt)
        row_kinds.append("section")
        if not rows:
            data.append([Paragraph("—", cell_ledger)] + [""] * n_amt)
            row_kinds.append("data")
        else:
            for r in rows:
                amounts = list(r.amounts) if r.amounts else [Decimal("0")] * len(months)
                # pad / trim to month count
                while len(amounts) < len(months):
                    amounts.append(Decimal("0"))
                amounts = amounts[: len(months)]
                data.append(
                    [Paragraph(_escape(r.ledger_name), cell_ledger)]
                    + [_money_compact(a) for a in amounts]
                    + [_money_compact(r.total, blank_zero=False)]
                )
                row_kinds.append("data")
        # Section total
        mt = list(month_totals) if month_totals else [Decimal("0")] * len(months)
        while len(mt) < len(months):
            mt.append(Decimal("0"))
        mt = mt[: len(months)]
        data.append(
            [Paragraph(f"Total {title}", cell_section)]
            + [_money_compact(a, blank_zero=False) for a in mt]
            + [_money_compact(section_total, blank_zero=False)]
        )
        row_kinds.append("total")
        # Hairline row → second stroke of double underline under total
        data.append([""] * (1 + n_amt))
        row_kinds.append("dbl")

    add_section("Income", report.income_rows, report.month_income_totals, report.total_income)
    add_section("Expenses", report.expense_rows, report.month_expense_totals, report.total_expenses)
    add_section(
        "Transfers", report.transfer_rows, report.month_transfer_totals, report.total_transfers
    )

    # Net row — same accounting rules as section totals
    nets = list(report.month_net_totals) if report.month_net_totals else [Decimal("0")] * len(months)
    while len(nets) < len(months):
        nets.append(Decimal("0"))
    nets = nets[: len(months)]
    data.append(
        [Paragraph("Net profit / (loss)", cell_section)]
        + [_money_compact(a, blank_zero=False) for a in nets]
        + [_money_compact(report.net_result, blank_zero=False)]
    )
    row_kinds.append("net")
    data.append([""] * (1 + n_amt))
    row_kinds.append("dbl")

    table = Table(data, colWidths=col_widths, repeatRows=1)

    grey_header = colors.HexColor("#e2e8f0")
    grey_section = colors.HexColor("#f1f5f9")
    grey_total = colors.HexColor("#f8fafc")
    grey_line = colors.HexColor("#cbd5e1")
    grey_alt = colors.HexColor("#f8fafc")
    white = colors.white
    net_bg = colors.HexColor("#e2e8f0")

    style_cmds: list = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 5.5),
        ("FONTSIZE", (1, 1), (-1, -1), 5.5),
        ("BACKGROUND", (0, 0), (-1, 0), grey_header),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#334155")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
        ("BOX", (0, 0), (-1, -1), 0.3, grey_line),
        ("INNERGRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#e2e8f0")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, grey_line),
    ]

    # Accounting rules: single line above totals/net; double line below
    # (double = LINEBELOW on the row + LINEABOVE on a following hairline row)
    rule_dark = colors.HexColor("#0f172a")
    data_row_i = 0
    for i, kind in enumerate(row_kinds):
        if kind == "header":
            continue
        if kind == "section":
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), grey_section))
            style_cmds.append(("FONTNAME", (0, i), (0, i), "Helvetica-Bold"))
        elif kind == "total":
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), grey_total))
            style_cmds.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
            style_cmds.append(("FONTSIZE", (0, i), (-1, i), 6))
            # Single line top
            style_cmds.append(("LINEABOVE", (0, i), (-1, i), 0.7, rule_dark))
            # First of double line bottom
            style_cmds.append(("LINEBELOW", (0, i), (-1, i), 0.45, rule_dark))
            style_cmds.append(("TOPPADDING", (0, i), (-1, i), 2.2))
            style_cmds.append(("BOTTOMPADDING", (0, i), (-1, i), 2.2))
        elif kind == "net":
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), net_bg))
            style_cmds.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
            style_cmds.append(("FONTSIZE", (0, i), (-1, i), 6.5))
            style_cmds.append(("LINEABOVE", (0, i), (-1, i), 0.75, rule_dark))
            style_cmds.append(("LINEBELOW", (0, i), (-1, i), 0.45, rule_dark))
            style_cmds.append(("TOPPADDING", (0, i), (-1, i), 2.4))
            style_cmds.append(("BOTTOMPADDING", (0, i), (-1, i), 2.4))
            if report.net_result < 0:
                style_cmds.append(("TEXTCOLOR", (1, i), (-1, i), colors.HexColor("#dc2626")))
            else:
                style_cmds.append(("TEXTCOLOR", (1, i), (-1, i), colors.HexColor("#15803d")))
        elif kind == "dbl":
            # Hairline row that forms the second line of the double underline
            style_cmds.append(("TOPPADDING", (0, i), (-1, i), 0.4))
            style_cmds.append(("BOTTOMPADDING", (0, i), (-1, i), 0.4))
            style_cmds.append(("FONTSIZE", (0, i), (-1, i), 1))
            style_cmds.append(("LINEBELOW", (0, i), (-1, i), 0.7, rule_dark))
            style_cmds.append(("TEXTCOLOR", (0, i), (-1, i), colors.white))
        elif kind == "data":
            if data_row_i % 2 == 1:
                style_cmds.append(("BACKGROUND", (0, i), (-1, i), grey_alt))
            data_row_i += 1

    table.setStyle(TableStyle(style_cmds))
    story.append(table)
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "Generated locally by LedgerFlow · Portrait A4 matrix · Not financial advice",
            footer_style,
        )
    )

    doc.build(story)
    return buffer.getvalue()

class _MonthlyBarsFlowable(Flowable):
    """Presentation chart: Income + Spending bars only (no budget — partial ledgers mislead)."""

    def __init__(self, report: MonthlyComparisonReport, width: float, height: float = 95 * mm):
        super().__init__()
        self.report = report
        self._w = width
        self._h = height

    def wrap(self, availWidth, availHeight):
        return self._w, self._h

    def draw(self):
        c = self.canv
        report = self.report
        months = sorted(report.months, key=lambda m: m.month_index)
        w, h = self._w, self._h
        pad_l, pad_r, pad_t, pad_b = 18 * mm, 8 * mm, 8 * mm, 14 * mm
        plot_w = w - pad_l - pad_r
        plot_h = h - pad_t - pad_b

        def n(v) -> float:
            try:
                return float(v or 0)
            except (TypeError, ValueError):
                return 0.0

        vals = []
        for m in months:
            vals.extend([n(m.income), n(m.expenses)])
        vmax = max(vals) if vals else 1.0
        if vmax <= 0:
            vmax = 1.0
        vmax *= 1.12

        col_income = colors.HexColor("#22c55e")
        col_spend = colors.HexColor("#e11d8c")
        grid = colors.HexColor("#e2e8f0")
        axis = colors.HexColor("#94a3b8")
        ink = colors.HexColor("#334155")

        c.setFillColor(colors.HexColor("#f8fafc"))
        c.roundRect(0, 0, w, h, 4, fill=1, stroke=0)

        c.setStrokeColor(grid)
        c.setFillColor(ink)
        c.setFont("Helvetica", 6)
        for t in (0, 0.25, 0.5, 0.75, 1.0):
            y = pad_b + plot_h * t
            c.setStrokeColor(grid)
            c.setLineWidth(0.4)
            c.line(pad_l, y, pad_l + plot_w, y)
            label = f"{vmax * t:,.0f}"
            c.setFillColor(ink)
            c.drawRightString(pad_l - 2 * mm, y - 1.5, label)

        c.setStrokeColor(axis)
        c.setLineWidth(0.8)
        c.line(pad_l, pad_b, pad_l, pad_b + plot_h)
        c.line(pad_l, pad_b, pad_l + plot_w, pad_b)

        group_w = plot_w / max(len(months), 1)
        bar_w = group_w * 0.32
        gap = group_w * 0.08

        for i, m in enumerate(months):
            gx = pad_l + i * group_w
            cx = gx + group_w / 2

            inc = n(m.income)
            ih = (inc / vmax) * plot_h
            c.setFillColor(col_income)
            c.roundRect(cx - bar_w - gap / 2, pad_b, bar_w, max(ih, 0.3 if inc > 0 else 0), 1, fill=1, stroke=0)

            exp = n(m.expenses)
            eh = (exp / vmax) * plot_h
            c.setFillColor(col_spend)
            c.roundRect(cx + gap / 2, pad_b, bar_w, max(eh, 0.3 if exp > 0 else 0), 1, fill=1, stroke=0)

            c.setFillColor(ink)
            c.setFont("Helvetica-Bold", 7)
            c.drawCentredString(cx, pad_b - 5 * mm, m.month_name or "")

        c.setFont("Helvetica", 7)
        lx = pad_l
        ly = h - 4 * mm
        for label, col in (
            ("Income", col_income),
            ("Spending", col_spend),
        ):
            c.setFillColor(col)
            c.rect(lx, ly - 1.5, 4 * mm, 2.5 * mm, fill=1, stroke=0)
            c.setFillColor(ink)
            c.drawString(lx + 5 * mm, ly, label)
            lx += 28 * mm


def generate_monthly_overview_pdf(
    report: MonthlyComparisonReport,
    letterhead: Optional[PdfLetterhead] = None,
) -> bytes:
    """Landscape A4 monthly overview for meetings — Income & Spending only."""
    buffer = io.BytesIO()
    page = landscape(A4)
    page_w, page_h = page
    margin = 10 * mm
    usable_w = page_w - 2 * margin

    doc = SimpleDocTemplate(
        buffer,
        pagesize=page,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
        title=f"Monthly overview – {report.primary_label}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "MOTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=2,
    )
    meta_style = ParagraphStyle(
        "MOMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=6,
    )
    footer_style = ParagraphStyle(
        "MOFooter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=6.5,
        textColor=colors.HexColor("#94a3b8"),
        alignment=TA_CENTER,
    )

    story: list = []
    if letterhead:
        story.extend(_letterhead_flowables(letterhead, usable_w))

    sym = _currency_symbol(report.currency)
    story.append(Paragraph("Monthly overview", title_style))
    story.append(
        Paragraph(
            f"<b>{_escape(report.primary_label)}</b> &nbsp;·&nbsp; "
            f"Income · Spending (allocated transactions) &nbsp;·&nbsp; "
            f"Amounts in <b>{_escape(sym)}</b> ({_escape(report.currency)})",
            meta_style,
        )
    )

    story.append(_MonthlyBarsFlowable(report, usable_w, height=88 * mm))
    story.append(Spacer(1, 6))

    months = sorted(report.months, key=lambda m: m.month_index)
    header = [""] + [m.month_name for m in months] + ["Total"]

    def row_nums(getter):
        vals = [Decimal(str(getter(m) or 0)) for m in months]
        total = sum(vals, Decimal("0"))
        return [_money_compact(v, blank_zero=False) for v in vals] + [
            _money_compact(total, blank_zero=False)
        ]

    data = [
        header,
        ["Income"] + row_nums(lambda m: m.income),
        ["Spending"] + row_nums(lambda m: m.expenses),
    ]
    nets = []
    for m in months:
        try:
            nets.append(Decimal(str(m.income or 0)) - Decimal(str(m.expenses or 0)))
        except Exception:
            nets.append(Decimal("0"))
    net_total = sum(nets, Decimal("0"))
    data.append(
        ["Net"]
        + [_money_compact(v, blank_zero=False) for v in nets]
        + [_money_compact(net_total, blank_zero=False)]
    )

    n_cols = len(header)
    first_w = 18 * mm
    rest_w = (usable_w - first_w) / (n_cols - 1)
    col_w = [first_w] + [rest_w] * (n_cols - 1)
    table = Table(data, colWidths=col_w, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 6.5),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#ecfdf5")),
                ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#fdf2f8")),
                ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
                ("LINEABOVE", (0, 3), (-1, 3), 0.7, colors.HexColor("#0f172a")),
                ("LINEBELOW", (0, 3), (-1, 3), 0.45, colors.HexColor("#0f172a")),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 5))
    story.append(
        Paragraph(
            "Generated locally by LedgerFlow · Landscape A4 for meetings · Not financial advice",
            footer_style,
        )
    )

    doc.build(story)
    return buffer.getvalue()


SA_COUNT_TOTAL_KEYS = {
    "accounts", "statements", "matched", "matched_after_gap_adjustment", "differences",
    "no_printed_balance", "transfer_legs", "paired_legs", "pairs", "unpaired_legs",
    "cross_type_candidates", "ledgers_listed", "reports_included", "profile_count",
}


def _sa_total_value(key: str, value, currency: str) -> str:
    """Counts / percentages in SA report totals are not money."""
    if key in SA_COUNT_TOTAL_KEYS:
        return f"{int(value):,}"
    if "pct" in key:
        return f"{value}%"
    return _money(value, currency)


def generate_sa_support_pdf(
    report,
    letterhead: Optional[PdfLetterhead] = None,
) -> bytes:
    """Portrait A4 PDF for SA support / tax workpapers."""
    from app.schemas import SaSupportReport

    assert isinstance(report, SaSupportReport)
    buffer = io.BytesIO()
    wide = any(len(sec.columns) > 6 for sec in report.sections)
    pagesize = landscape(A4) if wide else A4
    page_w, _page_h = pagesize
    usable_w = page_w - 30 * mm
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=12 * mm if letterhead else 15 * mm,
        bottomMargin=15 * mm,
        title=f"{report.title} – {report.period_label}",
    )
    styles = getSampleStyleSheet()
    title_st = ParagraphStyle(
        "SaTitle",
        parent=styles["Heading1"],
        fontSize=14,
        spaceAfter=4,
        textColor=colors.HexColor("#0f172a"),
    )
    sub_st = ParagraphStyle(
        "SaSub",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#475569"),
        spaceAfter=6,
    )
    sec_st = ParagraphStyle(
        "SaSec",
        parent=styles["Heading2"],
        fontSize=11,
        spaceBefore=8,
        spaceAfter=4,
        textColor=colors.HexColor("#0f172a"),
    )
    note_st = ParagraphStyle(
        "SaNote",
        parent=styles["Normal"],
        fontSize=7.5,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=2,
    )
    body_st = ParagraphStyle(
        "SaBody",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#334155"),
    )
    story: list = []
    if letterhead:
        story.extend(_letterhead_flowables(letterhead, usable_w))
    story.append(Paragraph(_escape(report.title), title_st))
    story.append(
        Paragraph(
            f"Period: <b>{_escape(report.period_label)}</b> &nbsp;|&nbsp; "
            f"{report.date_from.isoformat()} → {report.date_to.isoformat()} &nbsp;|&nbsp; "
            f"{_escape(report.currency)} &nbsp;|&nbsp; status: <b>{_escape(report.status)}</b>",
            sub_st,
        )
    )
    for n in report.notes[:6]:
        story.append(Paragraph(f"• {_escape(n)}", note_st))

    if report.totals:
        tot_data = [["Total", "Amount"]]
        for k, v in report.totals.items():
            tot_data.append([k.replace("_", " "), _sa_total_value(k, v, report.currency)])
        t = Table(tot_data, colWidths=[110 * mm, 60 * mm])
        t.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                    ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        story.append(Spacer(1, 4))
        story.append(t)

    for sec in report.sections:
        story.append(Paragraph(_escape(sec.title), sec_st))
        if sec.stub_message:
            story.append(Paragraph(_escape(sec.stub_message), body_st))
        if sec.summary:
            rows = [["Field", "Value"]]
            for k, v in sec.summary.items():
                rows.append([str(k).replace("_", " "), str(v)])
            st = Table(rows, colWidths=[90 * mm, 80 * mm])
            st.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                        ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#e2e8f0")),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                )
            )
            story.append(st)
        if sec.lines:
            has_dc = any(ln.debit or ln.credit for ln in sec.lines)
            if has_dc:
                rows = [["Ledger", "Type", "Debit", "Credit"]]
                for ln in sec.lines:
                    rows.append(
                        [
                            ln.ledger_name,
                            ln.ledger_type,
                            _money(ln.debit, report.currency) if ln.debit else "",
                            _money(ln.credit, report.currency) if ln.credit else "",
                        ]
                    )
                col_w = [70 * mm, 25 * mm, 35 * mm, 35 * mm]
            else:
                rows = [["Ledger", "Type", "Amount"]]
                for ln in sec.lines:
                    rows.append(
                        [
                            ln.ledger_name + (f"  ({ln.note})" if ln.note else ""),
                            ln.ledger_type,
                            _money(ln.amount, report.currency),
                        ]
                    )
                col_w = [95 * mm, 30 * mm, 40 * mm]
            lt = Table(rows, colWidths=col_w, repeatRows=1)
            lt.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
                        ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#e2e8f0")),
                        ("TOPPADDING", (0, 0), (-1, -1), 2),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                )
            )
            story.append(lt)
        if sec.columns and sec.rows:
            ncol = len(sec.columns)
            cell_st = ParagraphStyle("SaCell", parent=body_st, fontSize=6.2 if ncol > 6 else 7, leading=7.4 if ncol > 6 else 8.4)
            head_st = ParagraphStyle("SaHead", parent=cell_st, fontName="Helvetica-Bold")
            data = [[Paragraph(_escape(str(c)), head_st) for c in sec.columns]]
            for r in sec.rows[:400]:
                data.append([Paragraph(_escape("" if v is None else str(v)), cell_st) for v in r])
            if len(sec.rows) > 400:
                data.append([Paragraph(_escape(f"… +{len(sec.rows) - 400} more rows (see on-screen)"), cell_st)] + [""] * (ncol - 1))
            first_w = usable_w * (0.24 if ncol > 6 else 0.3)
            rest = (usable_w - first_w) / max(1, ncol - 1)
            gt = Table(data, colWidths=[first_w] + [rest] * (ncol - 1), repeatRows=1)
            gt.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                        ("GRID", (0, 0), (-1, -1), 0.15, colors.HexColor("#cbd5e1")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                    ]
                )
            )
            story.append(Spacer(1, 3))
            story.append(gt)
        # Cap transaction dump in PDF
        if sec.transactions and any(tx.debit is not None or tx.credit is not None for tx in sec.transactions):
            rows = [["Date", "Description", "Contra", "Debit", "Credit", "Balance"]]
            for tx in sec.transactions[:120]:
                rows.append(
                    [
                        tx.date.isoformat(),
                        (tx.description or "")[:48],
                        (tx.counter_ledger or "")[:30],
                        _money(tx.debit, report.currency) if tx.debit else "",
                        _money(tx.credit, report.currency) if tx.credit else "",
                        _money(tx.running_balance, report.currency) if tx.running_balance is not None else "",
                    ]
                )
            if len(sec.transactions) > 120:
                rows.append(["", f"… +{len(sec.transactions) - 120} more (see on-screen)", "", "", "", ""])
            w = usable_w
            tt = Table(rows, colWidths=[0.11 * w, 0.37 * w, 0.2 * w, 0.105 * w, 0.105 * w, 0.11 * w], repeatRows=1)
            tt.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 6.5),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
                        ("ALIGN", (3, 0), (5, -1), "RIGHT"),
                        ("GRID", (0, 0), (-1, -1), 0.15, colors.HexColor("#e2e8f0")),
                        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                    ]
                )
            )
            story.append(Spacer(1, 3))
            story.append(tt)
        elif sec.transactions:
            rows = [["Date", "Description", "Amount"]]
            for tx in sec.transactions[:80]:
                desc = (tx.description or "")[:60]
                rows.append(
                    [
                        tx.date.isoformat(),
                        desc,
                        _money(tx.amount, report.currency),
                    ]
                )
            if len(sec.transactions) > 80:
                rows.append(["", f"… +{len(sec.transactions) - 80} more (see on-screen)", ""])
            tt = Table(rows, colWidths=[25 * mm, 105 * mm, 35 * mm], repeatRows=1)
            tt.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 7),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
                        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                        ("GRID", (0, 0), (-1, -1), 0.15, colors.HexColor("#e2e8f0")),
                        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                    ]
                )
            )
            story.append(Spacer(1, 3))
            story.append(tt)

    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Generated locally by LedgerFlow · SA support workpaper · Not a SARS eFiling form",
            note_st,
        )
    )
    doc.build(story)
    return buffer.getvalue()
