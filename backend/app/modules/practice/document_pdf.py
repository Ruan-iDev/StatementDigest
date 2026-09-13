"""Quote / invoice PDF — Practice only. Matches the on-screen document layout."""

from __future__ import annotations

import io
from decimal import Decimal
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.config import DATA_DIR
from app.modules.practice.models import PracticeDocument
from app.services.money import to_decimal


# Quote/invoice number chip: #FFE600 at 50% over the page, rounded corners.
_NUMBER_HIGHLIGHT = colors.Color(1, 230 / 255, 0, alpha=0.5)


class RoundedNumberChip(Flowable):
    """Document number on a translucent rounded yellow highlight."""

    def __init__(
        self,
        text: str,
        *,
        font_name: str = "Helvetica-Bold",
        font_size: float = 12,
        text_color=colors.HexColor("#1a1a1a"),
        fill=_NUMBER_HIGHLIGHT,
        radius: float = 2.2 * mm,
        pad_x: float = 3.2 * mm,
        pad_y: float = 1.5 * mm,
    ):
        super().__init__()
        self.text = text or ""
        self.font_name = font_name
        self.font_size = font_size
        self.text_color = text_color
        self.fill = fill
        self.radius = radius
        self.pad_x = pad_x
        self.pad_y = pad_y
        tw = stringWidth(self.text, font_name, font_size) if self.text else 12
        self.width = tw + 2 * pad_x
        self.height = font_size + 2 * pad_y + 2
        self.hAlign = "CENTER"

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        c = self.canv
        r = min(self.radius, self.width / 2.0, self.height / 2.0)
        c.saveState()
        c.setFillColor(self.fill)
        c.roundRect(0, 0, self.width, self.height, r, fill=1, stroke=0)
        c.setFillColor(self.text_color)
        c.setFont(self.font_name, self.font_size)
        baseline = (self.height - self.font_size) / 2.0 + 1
        c.drawCentredString(self.width / 2.0, baseline, self.text)
        c.restoreState()


def _esc(s: object) -> str:
    return (
        str(s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _money(v: Decimal | float | int | None, currency: str = "ZAR") -> str:
    if v is None:
        return "—"
    n = to_decimal(v)
    sign = "-" if n < 0 else ""
    code = (currency or "ZAR").upper()
    sym = "R" if code == "ZAR" else code
    return f"{sign}{sym} {abs(n):,.2f}"


def _note_image_flowable(rel: str, max_w=160 * mm, max_h=90 * mm):
    from pathlib import Path

    p = Path(rel)
    if not p.is_absolute():
        p = DATA_DIR / rel
    if not p.is_file():
        return None
    try:
        iw, ih = ImageReader(str(p)).getSize()
        if not iw or not ih:
            return None
        scale = min(max_w / iw, max_h / ih, 1)
        return RLImage(str(p), width=iw * scale, height=ih * scale)
    except Exception:
        return None


def _card_lines(card: Optional[dict]) -> list[str]:
    if not card:
        return []
    out: list[str] = []
    name = card.get("name")
    trading = card.get("trading_name")
    if name:
        out.append(str(name))
    if trading and trading != name:
        out.append(f"t/a {trading}")
    for key in ("contact_name", "address_line1", "address_line2"):
        if card.get(key):
            out.append(str(card[key]))
    city = " ".join(x for x in [card.get("city"), card.get("postal_code")] if x)
    if city:
        out.append(city)
    if card.get("country"):
        out.append(str(card["country"]))
    if card.get("email"):
        out.append(str(card["email"]))
    if card.get("phone"):
        out.append(str(card["phone"]))
    if card.get("business_registration_number"):
        out.append(f"Reg {card['business_registration_number']}")
    if card.get("vat_number"):
        out.append(f"VAT {card['vat_number']}")
    return out


def generate_document_pdf(
    doc: PracticeDocument,
    *,
    currency: str = "ZAR",
    logo_path: Optional[str] = None,
    issuer: Optional[dict] = None,
) -> bytes:
    buf = io.BytesIO()
    page = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title=f"{doc.kind} {doc.number}",
    )
    styles = getSampleStyleSheet()
    heading = ParagraphStyle(
        "DocHead",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=18,
        leading=22,
        spaceAfter=2,
        textColor=colors.HexColor("#1e293b"),
    )
    label = ParagraphStyle(
        "Lbl",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=2,
    )
    label_head = ParagraphStyle(
        "LblHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=2,
    )
    body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=8.5, leading=11)
    right = ParagraphStyle("Right", parent=body, alignment=TA_RIGHT)
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#475569"))

    is_rfq = doc.kind == "rfq"
    if doc.kind == "invoice":
        kind = "INVOICE"
        ref_label = "Invoice Reference"
    elif is_rfq:
        kind = "RFQ"
        ref_label = "RFQ Reference"
    else:
        kind = "QUOTE"
        ref_label = "Quote Reference"
    story: list = []
    usable = 178 * mm
    third = usable / 3

    issued = doc.issued_on.isoformat() if doc.issued_on else ""
    left_block = [
        Paragraph("Issued Date", label_head),
        Paragraph(_esc(issued or "—"), small),
        Spacer(1, 2 * mm),
        Paragraph(ref_label, label_head),
        Paragraph(_esc(doc.title or "—"), small),
    ]
    number_chip = RoundedNumberChip(doc.number or "")
    mid_block = [
        Paragraph(kind, heading),
        *([Paragraph("Request for Quote", small)] if is_rfq else []),
        Spacer(1, 2 * mm),
        number_chip,
    ]
    logo_cell: object = ""
    if logo_path:
        from pathlib import Path

        p = Path(logo_path)
        if p.is_file():
            try:
                iw, ih = ImageReader(str(p)).getSize()
                if iw and ih:
                    max_w, max_h = third - 2 * mm, 28 * mm
                    scale = min(max_w / iw, max_h / ih)
                    img = RLImage(str(p), width=iw * scale, height=ih * scale)
                    img.hAlign = "RIGHT"
                    logo_cell = img
            except Exception:
                logo_cell = ""

    top = Table([[left_block, mid_block, logo_cell]], colWidths=[third, third, third])
    top.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(top)
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#94a3b8")))
    story.append(Spacer(1, 4 * mm))

    from_lines = "<br/>".join(_esc(x) for x in _card_lines(issuer or doc.issuer_snapshot))
    to_lines = "<br/>".join(_esc(x) for x in _card_lines(doc.client_snapshot))
    to_label = "To" if is_rfq else "Bill TO"
    parties = Table(
        [
            [Paragraph("FROM", label_head), Paragraph(to_label, label_head)],
            [Paragraph(from_lines or "—", body), Paragraph(to_lines or "—", body)],
        ],
        colWidths=[usable / 2, usable / 2],
    )
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(parties)
    story.append(Spacer(1, 5 * mm))

    if is_rfq:
        widths = [usable * 0.28, usable * 0.52, usable * 0.20]
        header = [
            Paragraph("Item", body),
            Paragraph("Description", body),
            Paragraph("Qty", right),
        ]
    else:
        widths = [usable * 0.20, usable * 0.30, usable * 0.10, usable * 0.20, usable * 0.20]
        header = [
            Paragraph("Item", body),
            Paragraph("Description", body),
            Paragraph("Qty", right),
            Paragraph("Rate", right),
            Paragraph("Line total ex VAT", right),
        ]
    data = [header]
    for ln in doc.lines or []:
        qty = to_decimal(ln.quantity)
        hide_money = qty == 0
        qty_cell = Paragraph("" if hide_money else _esc(f"{qty:g}"), right)
        item_cell = Paragraph(_esc(getattr(ln, "item", "") or "").replace("\n", "<br/>"), body)
        desc_cell = Paragraph(_esc(ln.description or "").replace("\n", "<br/>"), body)
        if is_rfq:
            data.append([item_cell, desc_cell, qty_cell])
        else:
            data.append(
                [
                    item_cell,
                    desc_cell,
                    qty_cell,
                    Paragraph("" if hide_money else _esc(_money(ln.unit_price, currency)), right),
                    Paragraph("" if hide_money else _esc(_money(ln.amount, currency)), right),
                ]
            )
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 5 * mm))

    if not is_rfq:
        vat_on = bool(getattr(doc, "vat_enabled", False))
        subtotal = to_decimal(getattr(doc, "subtotal", None) or doc.amount)
        vat_amt = to_decimal(getattr(doc, "vat_amount", None) or 0)
        rate = to_decimal(getattr(doc, "vat_rate", None) or 15)
        total = to_decimal(doc.amount)
        if vat_on:
            totals = [
                ["Subtotal ex VAT", _money(subtotal, currency)],
                [f"VAT {rate:g}%", _money(vat_amt, currency)],
                ["Total incl. VAT", _money(total, currency)],
            ]
        else:
            totals = [["Total excl. VAT", _money(subtotal, currency)]]
        tot = Table(totals, colWidths=[40 * mm, 40 * mm], hAlign="RIGHT")
        tot.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        story.append(tot)

    bank = getattr(doc, "bank_snapshot", None) or {}
    if not is_rfq and any(bank.get(k) for k in ("bank_name", "bank_account_number", "bank_account_name")):
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("Bank details", label_head))
        bits = [
            bank.get("bank_name"),
            bank.get("bank_account_name"),
            f"Acc {bank['bank_account_number']}" if bank.get("bank_account_number") else None,
            f"Branch {bank['bank_branch_code']}" if bank.get("bank_branch_code") else None,
            bank.get("bank_extra"),
        ]
        story.append(Paragraph(_esc(" · ".join(x for x in bits if x)), small))

    disc = getattr(doc, "disclaimer_snapshot", None)
    if disc:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph(_esc(disc).replace("\n", "<br/>"), small))
    blocks = getattr(doc, "notes_json", None) or []
    if not isinstance(blocks, list):
        blocks = []
    if not blocks and doc.notes:
        blocks = [{"type": "text", "body": doc.notes}]
    if blocks:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph("NOTES", label))
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "text" and block.get("body"):
                story.append(Paragraph(_esc(block.get("body")).replace("\n", "<br/>"), small))
                story.append(Spacer(1, 2 * mm))
            elif block.get("type") == "image" and block.get("path"):
                img = _note_image_flowable(str(block["path"]))
                if img:
                    story.append(img)
                    name = block.get("filename")
                    if name:
                        story.append(Paragraph(_esc(name), small))
                    story.append(Spacer(1, 2 * mm))

    page.build(story)
    return buf.getvalue()


def rasterize_pdf_pages(pdf_bytes: bytes, *, resolution: int = 288) -> list[bytes]:
    """PNG pages for in-app preview.

    288 DPI is an exact 4× PDF scale (72×4) so type stays sharp on screen and when
    those pages are sent to a printer. 140 DPI was a fractional scale and looked soft.
    """
    import pypdfium2 as pdfium

    scale = max(resolution, 72) / 72.0
    pages: list[bytes] = []
    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        for i in range(len(pdf)):
            page = pdf[i]
            bitmap = page.render(
                scale=scale,
                rev_byteorder=True,
                fill_color=(255, 255, 255, 255),
            )
            pil = bitmap.to_pil()
            if pil.mode not in ("RGB", "L"):
                pil = pil.convert("RGB")
            out = io.BytesIO()
            pil.save(out, format="PNG", optimize=True)
            pages.append(out.getvalue())
    finally:
        pdf.close()
    return pages


def _day(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return str(value.isoformat())[:10]
    return str(value)[:10]


def generate_supplier_statement_pdf(
    *,
    supplier: dict,
    expenses: list,
    spent,
    currency: str = "ZAR",
    logo_path: Optional[str] = None,
    issuer: Optional[dict] = None,
    as_of: Optional[str] = None,
) -> bytes:
    """Spend with one supplier — same family as quote/invoice PDFs."""
    from datetime import date as date_cls

    buf = io.BytesIO()
    page = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title=f"Supplier statement {supplier.get('name') or ''}".strip(),
    )
    styles = getSampleStyleSheet()
    heading = ParagraphStyle(
        "SupHead",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=16,
        leading=20,
        spaceAfter=2,
        textColor=colors.HexColor("#1e293b"),
    )
    name_style = ParagraphStyle(
        "SupName",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#1a1a1a"),
    )
    label_head = ParagraphStyle(
        "SupLbl",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=2,
    )
    body = ParagraphStyle("SupBody", parent=styles["Normal"], fontSize=8.5, leading=11)
    right = ParagraphStyle("SupRight", parent=body, alignment=TA_RIGHT)
    small = ParagraphStyle(
        "SupSmall", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#475569")
    )

    story: list = []
    usable = 178 * mm
    third = usable / 3
    as_at = as_of or date_cls.today().isoformat()

    left_block = [
        Paragraph("Statement date", label_head),
        Paragraph(_esc(as_at), small),
    ]
    name_chip = Table([[Paragraph(_esc(supplier.get("name") or "Supplier"), name_style)]])
    name_chip.hAlign = "CENTER"
    name_chip.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFE600")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    mid_block = [Paragraph("SUPPLIER STATEMENT", heading), Spacer(1, 2 * mm), name_chip]
    logo_cell: object = ""
    if logo_path:
        from pathlib import Path

        p = Path(logo_path)
        if p.is_file():
            try:
                iw, ih = ImageReader(str(p)).getSize()
                if iw and ih:
                    max_w, max_h = third - 2 * mm, 28 * mm
                    scale = min(max_w / iw, max_h / ih)
                    img = RLImage(str(p), width=iw * scale, height=ih * scale)
                    img.hAlign = "RIGHT"
                    logo_cell = img
            except Exception:
                logo_cell = ""

    top = Table([[left_block, mid_block, logo_cell]], colWidths=[third, third, third])
    top.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(top)
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#94a3b8")))
    story.append(Spacer(1, 4 * mm))

    from_lines = "<br/>".join(_esc(x) for x in _card_lines(issuer))
    to_lines = "<br/>".join(_esc(x) for x in _card_lines(supplier))
    parties = Table(
        [
            [Paragraph("FROM", label_head), Paragraph("Supplier", label_head)],
            [Paragraph(from_lines or "—", body), Paragraph(to_lines or "—", body)],
        ],
        colWidths=[usable / 2, usable / 2],
    )
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(parties)
    story.append(Spacer(1, 5 * mm))

    widths = [usable * 0.18, usable * 0.34, usable * 0.28, usable * 0.20]
    data = [
        [
            Paragraph("Date", body),
            Paragraph("What was spent", body),
            Paragraph("Project", body),
            Paragraph("Amount", right),
        ]
    ]
    if not expenses:
        data.append(
            [
                Paragraph("", body),
                Paragraph("No spend recorded yet.", small),
                Paragraph("", body),
                Paragraph("", right),
            ]
        )
    for ex in expenses:
        data.append(
            [
                Paragraph(_esc(_day(ex.get("incurred_on"))), body),
                Paragraph(_esc(ex.get("description") or ""), body),
                Paragraph(_esc(ex.get("project_name") or "—"), body),
                Paragraph(_esc(_money(ex.get("amount"), currency)), right),
            ]
        )
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 5 * mm))
    tot = Table(
        [["Total spent", _money(spent, currency)]],
        colWidths=[40 * mm, 40 * mm],
        hAlign="RIGHT",
    )
    tot.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    story.append(tot)
    page.build(story)
    return buf.getvalue()
