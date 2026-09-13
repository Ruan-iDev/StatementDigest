"""RFQ documents: numbering prefix and quote-like PDF without prices."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.modules.practice.document_pdf import generate_document_pdf, rasterize_pdf_pages
from app.modules.practice.templates import default_prefix


def test_rfq_prefix():
    assert default_prefix("rfq") == "RFQ"
    assert default_prefix("quote") == "QTE"
    assert default_prefix("invoice") == "INV"


def test_rfq_pdf_has_qty_not_prices():
    line = SimpleNamespace(
        item="Timber",
        description="Pine 2x4",
        quantity=Decimal("10"),
        unit_price=Decimal("99.00"),
        amount=Decimal("990.00"),
    )
    doc = SimpleNamespace(
        kind="rfq",
        number="RFQ-001",
        title="Kitchen",
        issued_on=date(2026, 1, 15),
        issuer_snapshot={"name": "LedgerFlow Test"},
        client_snapshot={"name": "Supplier Co"},
        lines=[line],
        vat_enabled=False,
        subtotal=Decimal("0"),
        vat_amount=Decimal("0"),
        vat_rate=Decimal("0"),
        amount=Decimal("0"),
        bank_snapshot={"bank_name": "Should not print", "bank_account_number": "123"},
        disclaimer_snapshot=None,
        notes_json=None,
        notes=None,
    )
    pdf_bytes = generate_document_pdf(doc, currency="ZAR")
    assert pdf_bytes.startswith(b"%PDF")
    pages = rasterize_pdf_pages(pdf_bytes, resolution=72)
    assert pages, "RFQ PDF should rasterize at least one page"

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        text = ""
        for i in range(len(pdf)):
            text += pdf[i].get_textpage().get_text_bounded()
    finally:
        pdf.close()
    assert "RFQ" in text
    assert "Request for Quote" in text
    assert "Timber" in text
    assert "Pine 2x4" in text
    assert "Rate" not in text
    assert "Line total" not in text
    assert "Should not print" not in text
    assert "R 99" not in text
    assert "R 990" not in text
