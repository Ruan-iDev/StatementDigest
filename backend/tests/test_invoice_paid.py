"""Paid invoice stamp on the PDF printout."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.modules.practice.document_pdf import (
    generate_document_pdf,
    invoice_is_paid,
    merge_pdfs,
    rasterize_pdf_pages,
)


def _invoice(status: str, number: str = "INV-001") -> SimpleNamespace:
    line = SimpleNamespace(
        item="Labour",
        description="Kitchen install",
        quantity=Decimal("1"),
        unit_price=Decimal("1500.00"),
        amount=Decimal("1500.00"),
    )
    return SimpleNamespace(
        kind="invoice",
        number=number,
        title="Kitchen",
        status=status,
        issued_on=date(2026, 3, 1),
        issuer_snapshot={"name": "LedgerFlow Test"},
        client_snapshot={"name": "Client Co"},
        lines=[line],
        vat_enabled=False,
        subtotal=Decimal("1500.00"),
        vat_amount=Decimal("0"),
        vat_rate=Decimal("0"),
        amount=Decimal("1500.00"),
        bank_snapshot=None,
        disclaimer_snapshot=None,
        notes_json=None,
        notes=None,
    )


def _pdf_text(pdf_bytes: bytes) -> str:
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        text = ""
        for i in range(len(pdf)):
            text += pdf[i].get_textpage().get_text_bounded()
    finally:
        pdf.close()
    return text


def test_invoice_is_paid_helper():
    assert invoice_is_paid(_invoice("paid"))
    assert not invoice_is_paid(_invoice("draft"))
    assert not invoice_is_paid(SimpleNamespace(kind="quote", status="paid"))


def test_paid_invoice_pdf_has_stamp():
    pdf_bytes = generate_document_pdf(_invoice("paid"), currency="ZAR")
    assert pdf_bytes.startswith(b"%PDF")
    pages = rasterize_pdf_pages(pdf_bytes, resolution=72)
    assert pages, "Paid invoice PDF should rasterize"
    text = _pdf_text(pdf_bytes)
    assert "PAID" in text
    assert "Thank you" in text
    assert "INV-001" in text


def test_unpaid_invoice_pdf_has_no_stamp():
    pdf_bytes = generate_document_pdf(_invoice("draft"), currency="ZAR")
    assert pdf_bytes.startswith(b"%PDF")
    text = _pdf_text(pdf_bytes)
    assert "PAID" not in text
    assert "Thank you" not in text
    assert "INV-001" in text


def test_merge_invoice_pdfs_keeps_each_number():
    paid = generate_document_pdf(_invoice("paid", "INV-001"), currency="ZAR")
    unpaid = generate_document_pdf(_invoice("draft", "INV-002"), currency="ZAR")
    merged = merge_pdfs([paid, unpaid])
    assert merged.startswith(b"%PDF")
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(merged)
    try:
        assert len(pdf) == 2
        text = ""
        for i in range(len(pdf)):
            text += pdf[i].get_textpage().get_text_bounded()
    finally:
        pdf.close()
    assert "INV-001" in text
    assert "INV-002" in text
    assert "PAID" in text
