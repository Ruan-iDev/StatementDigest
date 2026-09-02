"""Quotes, invoices, expenses, and the project statement. Independent features."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_active_profile, get_active_profile_id
from app.models import Ledger, UserProfile
from app.modules.practice.flags import get_or_create_settings, require_feature
from app.modules.practice.templates import (
    bank_dict,
    get_or_create_template,
    peek_number,
    resolve_issuer,
    resolve_logo_path,
    resolve_vat,
    take_number,
)
from app.modules.practice.models import (
    DocumentKind,
    DocumentStatus,
    EntryType,
    PartyKind,
    PracticeDocument,
    PracticeDocumentLine,
    PracticeEntry,
    PracticeExpense,
    PracticeParty,
    PracticeProject,
)
from app.modules.practice.schemas import (
    AddressCard,
    DocumentCreate,
    DocumentLineIn,
    DocumentLineOut,
    DocumentOut,
    DocumentPrepareOut,
    DocumentPreviewOut,
    DocumentPreviewPage,
    DocumentUpdate,
    ExpenseCreate,
    ExpenseOut,
    ExpenseUpdate,
    InvoiceFromQuote,
    NoteImageOut,
    PartyOut,
    ProjectOut,
    ProjectStatementOut,
    StatementTotals,
    SupplierSpendTotals,
    SupplierStatementOut,
    EntryOut,
)
from app.config import DATA_DIR
from app.services.money import quantize_money, to_decimal

router = APIRouter()

_DOC_STATUSES = {s.value for s in DocumentStatus}
_NOTE_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_NOTE_IMAGE_MAX = 6 * 1024 * 1024


def _money(value) -> Decimal:
    return quantize_money(to_decimal(value if value is not None else 0))


def _clean_notes_json(raw) -> list | None:
    if not raw or not isinstance(raw, list):
        return None
    out: list = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind == "text":
            out.append({"type": "text", "body": str(item.get("body") or "")})
        elif kind == "image":
            path = str(item.get("path") or "").replace("\\", "/")
            if not path.startswith("practice_note_images/"):
                continue
            out.append(
                {
                    "type": "image",
                    "path": path,
                    "filename": str(item.get("filename") or Path(path).name),
                }
            )
    return out


def _ledger(db: Session, profile_id: int, ledger_id: int, expect_type: str | None = None) -> Ledger:
    row = (
        db.query(Ledger)
        .filter(Ledger.id == ledger_id, Ledger.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Ledger not found in this workspace")
    if expect_type and row.type != expect_type:
        raise HTTPException(400, f"Pick a {expect_type} ledger")
    return row


def _party(db: Session, profile_id: int, party_id: int | None) -> PracticeParty | None:
    if party_id is None:
        return None
    row = (
        db.query(PracticeParty)
        .filter(PracticeParty.id == party_id, PracticeParty.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Client or supplier not found")
    return row


def _project(db: Session, profile_id: int, project_id: int | None) -> PracticeProject | None:
    if project_id is None:
        return None
    row = (
        db.query(PracticeProject)
        .filter(PracticeProject.id == project_id, PracticeProject.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Project not found")
    return row


def _issuer_card(db: Session, profile: UserProfile) -> AddressCard:
    return resolve_issuer(db, profile)


def _client_card(party: PracticeParty) -> AddressCard:
    return AddressCard(
        name=party.name,
        trading_name=party.trading_name,
        contact_name=party.contact_name,
        email=party.email,
        phone=party.phone,
        address_line1=party.address_line1,
        address_line2=party.address_line2,
        city=party.city,
        postal_code=party.postal_code,
        country=party.country,
        tax_number=party.tax_number,
        vat_number=party.vat_number,
        business_registration_number=getattr(party, "business_registration_number", None),
        party_type=getattr(party, "party_type", None) or "individual",
    )


def _replace_lines(db: Session, document: PracticeDocument, lines: list[DocumentLineIn]) -> Decimal:
    document.lines.clear()
    db.flush()
    total = Decimal("0.00")
    for i, line in enumerate(lines):
        item = (line.item or "").strip()
        desc = (line.description or "").strip()
        if not item and not desc:
            continue
        qty = _money(line.quantity if line.quantity is not None else 1)
        price = _money(line.unit_price)
        amount = _money(qty * price)
        total += amount
        document.lines.append(
            PracticeDocumentLine(
                item=item,
                description=desc,
                quantity=qty,
                unit_price=price,
                amount=amount,
                sort_order=i,
            )
        )
    return _money(total)


def _stamp_money(row: PracticeDocument, subtotal: Decimal, template, settings) -> None:
    vat_on, rate = resolve_vat(settings)
    vat = _money(subtotal * rate / Decimal("100")) if vat_on else _money(0)
    row.vat_enabled = vat_on
    row.vat_rate = rate
    row.subtotal = subtotal
    row.vat_amount = vat
    row.amount = _money(subtotal + vat) if vat_on else subtotal
    row.bank_snapshot = bank_dict(template)
    row.disclaimer_snapshot = template.disclaimer


def _document_out(db: Session, row: PracticeDocument) -> DocumentOut:
    party_name = row.party.name if row.party else None
    project_name = row.project.name if row.project else None
    income_name = None
    if row.income_ledger_id:
        led = db.get(Ledger, row.income_ledger_id)
        income_name = led.name if led else None
    source_number = None
    if row.source_quote_id:
        src = db.get(PracticeDocument, row.source_quote_id)
        source_number = src.number if src else None
    profile = db.get(UserProfile, row.user_profile_id)
    issuer = _issuer_card(db, profile) if profile else None
    if issuer is None and row.issuer_snapshot:
        issuer = AddressCard.model_validate(row.issuer_snapshot)
    client = AddressCard.model_validate(row.client_snapshot) if row.client_snapshot else None
    if client is None and row.party:
        client = _client_card(row.party)
    lines = [
        DocumentLineOut(
            id=ln.id,
            item=getattr(ln, "item", "") or "",
            description=ln.description,
            quantity=_money(ln.quantity),
            unit_price=_money(ln.unit_price),
            amount=_money(ln.amount),
            sort_order=ln.sort_order,
        )
        for ln in (row.lines or [])
    ]
    return DocumentOut(
        id=row.id,
        kind=row.kind,
        number=row.number,
        title=row.title,
        amount=_money(row.amount),
        issued_on=row.issued_on,
        due_on=row.due_on,
        party_id=row.party_id,
        party_name=party_name,
        project_id=row.project_id,
        project_name=project_name,
        income_ledger_id=row.income_ledger_id,
        income_ledger_name=income_name,
        source_quote_id=row.source_quote_id,
        source_quote_number=source_number,
        status=row.status,
        notes=row.notes,
        notes_json=getattr(row, "notes_json", None),
        vat_enabled=bool(getattr(row, "vat_enabled", False)),
        vat_rate=_money(getattr(row, "vat_rate", 15) or 15),
        subtotal=_money(getattr(row, "subtotal", row.amount) or 0),
        vat_amount=_money(getattr(row, "vat_amount", 0) or 0),
        issuer=issuer,
        client=client,
        bank=getattr(row, "bank_snapshot", None),
        disclaimer=getattr(row, "disclaimer_snapshot", None),
        has_logo=False,
        lines=lines,
        is_archived=row.is_archived,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _assert_supplier(db: Session, profile_id: int, supplier_id: int | None) -> PracticeParty | None:
    if supplier_id is None:
        return None
    row = _party(db, profile_id, supplier_id)
    if not row or row.kind != PartyKind.SUPPLIER.value:
        raise HTTPException(400, "Vendor must be a supplier from your library")
    return row


def _expense_out(db: Session, row: PracticeExpense) -> ExpenseOut:
    led = db.get(Ledger, row.ledger_id)
    project = db.get(PracticeProject, row.project_id) if row.project_id else None
    supplier_id = getattr(row, "supplier_id", None)
    supplier = db.get(PracticeParty, supplier_id) if supplier_id else None
    vendor = getattr(row, "vendor_name", None) or (supplier.name if supplier else None)
    return ExpenseOut(
        id=row.id,
        project_id=row.project_id,
        project_name=project.name if project else None,
        ledger_id=row.ledger_id,
        ledger_name=led.name if led else None,
        supplier_id=supplier_id,
        supplier_name=supplier.name if supplier else vendor,
        description=row.description,
        vendor_name=vendor,
        amount=_money(row.amount),
        incurred_on=row.incurred_on,
        notes=row.notes,
        is_archived=row.is_archived,
        created_at=row.created_at,
    )


def _clean_vendor(value: str | None) -> str | None:
    raw = (value or "").strip()
    return raw or None


def _expense_trail_body(vendor: str | None, notes: str | None) -> str | None:
    bits = [p for p in (_clean_vendor(vendor), (notes or "").strip() or None) if p]
    return " · ".join(bits) or None


def _sync_expense_trail(db: Session, profile_id: int, row: PracticeExpense) -> None:
    trail = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.user_profile_id == profile_id,
            PracticeEntry.expense_id == row.id,
        )
        .first()
    )
    if not trail:
        return
    trail.title = row.description
    trail.body = _expense_trail_body(row.vendor_name, row.notes)
    trail.amount = row.amount
    trail.occurred_on = row.incurred_on


def _trail(
    db: Session,
    profile_id: int,
    project_id: int,
    entry_type: str,
    title: str,
    body: str | None = None,
    amount: Decimal | None = None,
    document_id: int | None = None,
    expense_id: int | None = None,
    occurred_on: date | None = None,
) -> None:
    db.add(
        PracticeEntry(
            user_profile_id=profile_id,
            project_id=project_id,
            entry_type=entry_type,
            title=title,
            body=body,
            amount=amount,
            document_id=document_id,
            expense_id=expense_id,
            occurred_on=occurred_on or date.today(),
            created_at=datetime.utcnow(),
        )
    )
    project = db.get(PracticeProject, project_id)
    if project:
        project.updated_at = datetime.utcnow()


@router.get("/documents", response_model=list[DocumentOut])
def list_documents(
    kind: str | None = Query(default=None, pattern="^(quote|invoice)$"),
    project_id: int | None = None,
    party_id: int | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    q = db.query(PracticeDocument).filter(PracticeDocument.user_profile_id == profile_id)
    if kind:
        q = q.filter(PracticeDocument.kind == kind)
    if project_id is not None:
        q = q.filter(PracticeDocument.project_id == project_id)
    if party_id is not None:
        q = q.filter(PracticeDocument.party_id == party_id)
    if not include_archived:
        q = q.filter(PracticeDocument.is_archived.is_(False))
    rows = q.order_by(PracticeDocument.issued_on.desc(), PracticeDocument.id.desc()).all()
    return [_document_out(db, r) for r in rows]


@router.get("/documents/prepare", response_model=DocumentPrepareOut)
def prepare_document(
    kind: str = Query(pattern="^(quote|invoice)$"),
    party_id: int | None = None,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    require_feature(db, profile.id, "quotes" if kind == "quote" else "invoices")
    party = _party(db, profile.id, party_id)
    project = _project(db, profile.id, project_id)
    if project and party is None and project.client:
        party = project.client
    sales = (
        db.query(Ledger)
        .filter(
            Ledger.user_profile_id == profile.id,
            Ledger.type == "income",
            Ledger.is_archived.is_(False),
        )
        .order_by(Ledger.sort_order.asc(), Ledger.name.asc())
        .all()
    )
    default_led = next((l for l in sales if "sales" in l.name.lower()), sales[0] if sales else None)
    title = project.name if project else (party.name if party else ("Quote" if kind == "quote" else "Invoice"))
    issued = date.today()
    tmpl = get_or_create_template(db, profile.id, kind)
    settings = get_or_create_settings(db, profile.id)
    vat_on, vat_rate = resolve_vat(settings)
    logo_path, _src = resolve_logo_path(db, profile)
    return DocumentPrepareOut(
        kind=kind,
        number=peek_number(db, profile.id, kind),
        currency=profile.currency or "ZAR",
        suggested_title=title,
        issued_on=issued,
        issuer=_issuer_card(db, profile),
        client=_client_card(party) if party else None,
        party_id=party.id if party else None,
        project_id=project.id if project else None,
        project_name=project.name if project else None,
        default_income_ledger_id=default_led.id if default_led else None,
        default_income_ledger_name=default_led.name if default_led else None,
        vat_enabled=vat_on,
        vat_rate=vat_rate,
        has_logo=logo_path is not None,
        bank=bank_dict(tmpl),
        disclaimer=tmpl.disclaimer,
    )


@router.post("/documents", response_model=DocumentOut, status_code=201)
def create_document(
    body: DocumentCreate,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    require_feature(db, profile.id, "quotes" if body.kind == "quote" else "invoices")
    if body.status not in _DOC_STATUSES:
        raise HTTPException(400, "Invalid document status")
    party = _party(db, profile.id, body.party_id)
    project = _project(db, profile.id, body.project_id)
    income_id = body.income_ledger_id
    if body.kind == DocumentKind.INVOICE.value:
        if not income_id:
            raise HTTPException(400, "Pick a sales / income ledger for this invoice")
        _ledger(db, profile.id, income_id, expect_type="income")
    else:
        income_id = None

    source_id = body.source_quote_id
    if source_id:
        src = (
            db.query(PracticeDocument)
            .filter(
                PracticeDocument.id == source_id,
                PracticeDocument.user_profile_id == profile.id,
                PracticeDocument.kind == DocumentKind.QUOTE.value,
            )
            .first()
        )
        if not src:
            raise HTTPException(404, "Source quote not found")

    row = PracticeDocument(
        user_profile_id=profile.id,
        kind=body.kind,
        number=take_number(db, profile.id, body.kind),
        title=body.title.strip(),
        amount=_money(0),
        issued_on=body.issued_on or date.today(),
        due_on=None,
        party_id=body.party_id,
        project_id=body.project_id,
        income_ledger_id=income_id,
        source_quote_id=source_id,
        status=body.status,
        notes=body.notes,
        notes_json=_clean_notes_json(body.notes_json),
        issuer_snapshot=_issuer_card(db, profile).model_dump(),
        client_snapshot=_client_card(party).model_dump() if party else None,
    )
    db.add(row)
    db.flush()
    tmpl = get_or_create_template(db, profile.id, body.kind)
    settings = get_or_create_settings(db, profile.id)
    if body.lines:
        subtotal = _replace_lines(db, row, body.lines)
    else:
        subtotal = _money(body.amount)
    _stamp_money(row, subtotal, tmpl, settings)
    if project:
        label = "Quote" if body.kind == "quote" else "Invoice"
        _trail(
            db,
            profile.id,
            project.id,
            body.kind,
            f"{label} {row.number}",
            body.title.strip(),
            row.amount,
            document_id=row.id,
            occurred_on=row.issued_on,
        )
    db.commit()
    db.refresh(row)
    return _document_out(db, row)


@router.post("/note-images", response_model=NoteImageOut)
async def upload_note_image(
    file: UploadFile = File(...),
    profile: UserProfile = Depends(get_active_profile),
):
    filename = file.filename or "image.png"
    ext = Path(filename).suffix.lower()
    if ext not in _NOTE_IMAGE_EXT:
        raise HTTPException(400, "Image must be PNG, JPG, WEBP, or GIF")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    if len(raw) > _NOTE_IMAGE_MAX:
        raise HTTPException(400, "Image must be 6 MB or smaller")
    rel = f"practice_note_images/p{profile.id}_{uuid4().hex[:12]}{ext}"
    dest = DATA_DIR / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    return NoteImageOut(path=rel, filename=filename)


@router.get("/note-images")
def get_note_image(
    path: str,
    profile: UserProfile = Depends(get_active_profile),
):
    rel = (path or "").replace("\\", "/").lstrip("/")
    prefix = f"practice_note_images/p{profile.id}_"
    if not rel.startswith(prefix):
        raise HTTPException(404, "Image not found")
    full = DATA_DIR / rel
    if not full.is_file():
        raise HTTPException(404, "Image not found")
    media = "image/png"
    suf = full.suffix.lower()
    if suf in (".jpg", ".jpeg"):
        media = "image/jpeg"
    elif suf == ".webp":
        media = "image/webp"
    elif suf == ".gif":
        media = "image/gif"
    return FileResponse(full, media_type=media, filename=full.name)


@router.get("/documents/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = (
        db.query(PracticeDocument)
        .filter(PracticeDocument.id == document_id, PracticeDocument.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Document not found")
    return _document_out(db, row)


@router.get("/documents/{document_id}/pdf")
def document_pdf(
    document_id: int,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    row = (
        db.query(PracticeDocument)
        .options(joinedload(PracticeDocument.lines), joinedload(PracticeDocument.party))
        .filter(PracticeDocument.id == document_id, PracticeDocument.user_profile_id == profile.id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Document not found")
    require_feature(db, profile.id, "quotes" if row.kind == "quote" else "invoices")
    from app.modules.practice.document_pdf import generate_document_pdf

    logo, _src = resolve_logo_path(db, profile)
    pdf_bytes = generate_document_pdf(
        row,
        currency=profile.currency or "ZAR",
        logo_path=str(logo) if logo else None,
        issuer=_issuer_card(db, profile).model_dump(),
    )
    safe = (row.number or row.kind).replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{row.kind}_{safe}.pdf"'},
    )


@router.get("/documents/{document_id}/preview", response_model=DocumentPreviewOut)
def document_preview(
    document_id: int,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    """PNG pages of the quote/invoice template — shown in-app, no browser PDF plugin."""
    import base64

    row = (
        db.query(PracticeDocument)
        .options(joinedload(PracticeDocument.lines), joinedload(PracticeDocument.party))
        .filter(PracticeDocument.id == document_id, PracticeDocument.user_profile_id == profile.id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Document not found")
    require_feature(db, profile.id, "quotes" if row.kind == "quote" else "invoices")
    from app.modules.practice.document_pdf import generate_document_pdf, rasterize_pdf_pages

    logo, _src = resolve_logo_path(db, profile)
    pdf_bytes = generate_document_pdf(
        row,
        currency=profile.currency or "ZAR",
        logo_path=str(logo) if logo else None,
        issuer=_issuer_card(db, profile).model_dump(),
    )
    pngs = rasterize_pdf_pages(pdf_bytes)
    if not pngs:
        raise HTTPException(500, "Could not render document preview")
    pages = [
        DocumentPreviewPage(
            index=i,
            data_url="data:image/png;base64," + base64.b64encode(png).decode("ascii"),
        )
        for i, png in enumerate(pngs)
    ]
    return DocumentPreviewOut(
        kind=row.kind,
        number=row.number,
        title=row.title,
        page_count=len(pages),
        pages=pages,
    )


@router.patch("/documents/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: int,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = (
        db.query(PracticeDocument)
        .filter(PracticeDocument.id == document_id, PracticeDocument.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Document not found")
    require_feature(db, profile_id, "quotes" if row.kind == "quote" else "invoices")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is not None and data["status"] not in _DOC_STATUSES:
        raise HTTPException(400, "Invalid document status")
    if "party_id" in data:
        _party(db, profile_id, data["party_id"])
    if "project_id" in data:
        _project(db, profile_id, data["project_id"])
    if "income_ledger_id" in data and data["income_ledger_id"] is not None:
        _ledger(db, profile_id, data["income_ledger_id"], expect_type="income")
    if "amount" in data and data["amount"] is not None:
        data["amount"] = _money(data["amount"])
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    if "notes_json" in data:
        data["notes_json"] = _clean_notes_json(data["notes_json"])
    if "due_on" in data:
        data["due_on"] = None
    old_project_id = row.project_id
    lines = data.pop("lines", None)
    for key, value in data.items():
        setattr(row, key, value)
    if lines is not None:
        parsed = [
            DocumentLineIn.model_validate(x) if not isinstance(x, DocumentLineIn) else x for x in lines
        ]
        subtotal = _replace_lines(db, row, parsed)
        tmpl = get_or_create_template(db, profile_id, row.kind)
        settings = get_or_create_settings(db, profile_id)
        _stamp_money(row, subtotal, tmpl, settings)
    profile = db.get(UserProfile, profile_id)
    if profile:
        row.issuer_snapshot = _issuer_card(db, profile).model_dump()
    if row.party:
        row.client_snapshot = _client_card(row.party).model_dump()
    if row.project_id and row.project_id != old_project_id:
        label = "Quote" if row.kind == "quote" else "Invoice"
        _trail(
            db,
            profile_id,
            row.project_id,
            row.kind,
            f"{label} {row.number}",
            row.title,
            row.amount,
            document_id=row.id,
            occurred_on=row.issued_on,
        )
    elif row.issued_on:
        db.query(PracticeEntry).filter(
            PracticeEntry.document_id == row.id,
            PracticeEntry.entry_type.in_([EntryType.QUOTE.value, EntryType.INVOICE.value]),
        ).update(
            {PracticeEntry.occurred_on: row.issued_on},
            synchronize_session=False,
        )
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _document_out(db, row)


@router.post("/quotes/{quote_id}/invoice", response_model=DocumentOut, status_code=201)
def invoice_from_quote(
    quote_id: int,
    body: InvoiceFromQuote,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "quotes")
    require_feature(db, profile_id, "invoices")
    quote = (
        db.query(PracticeDocument)
        .filter(
            PracticeDocument.id == quote_id,
            PracticeDocument.user_profile_id == profile_id,
            PracticeDocument.kind == DocumentKind.QUOTE.value,
        )
        .first()
    )
    if not quote:
        raise HTTPException(404, "Quote not found")
    _ledger(db, profile_id, body.income_ledger_id, expect_type="income")
    profile = db.get(UserProfile, profile_id)
    invoice = PracticeDocument(
        user_profile_id=profile_id,
        kind=DocumentKind.INVOICE.value,
        number=take_number(db, profile_id, DocumentKind.INVOICE.value),
        title=quote.title,
        amount=_money(quote.amount),
        issued_on=body.issued_on or date.today(),
        due_on=None,
        party_id=quote.party_id,
        project_id=quote.project_id,
        income_ledger_id=body.income_ledger_id,
        source_quote_id=quote.id,
        status=DocumentStatus.DRAFT.value,
        notes=body.notes or quote.notes,
        notes_json=getattr(quote, "notes_json", None),
        issuer_snapshot=_issuer_card(db, profile).model_dump() if profile else quote.issuer_snapshot,
        client_snapshot=quote.client_snapshot,
    )
    db.add(invoice)
    db.flush()
    tmpl = get_or_create_template(db, profile_id, "invoice")
    settings = get_or_create_settings(db, profile_id)
    if quote.lines:
        subtotal = _replace_lines(
            db,
            invoice,
            [
                DocumentLineIn(
                    item=getattr(ln, "item", "") or "",
                    description=ln.description,
                    quantity=ln.quantity,
                    unit_price=ln.unit_price,
                )
                for ln in quote.lines
            ],
        )
    else:
        subtotal = _money(quote.subtotal or quote.amount)
    _stamp_money(invoice, subtotal, tmpl, settings)
    quote.status = DocumentStatus.INVOICED.value
    quote.updated_at = datetime.utcnow()
    if quote.project_id:
        _trail(
            db,
            profile_id,
            quote.project_id,
            EntryType.INVOICE.value,
            f"Invoice {invoice.number} from {quote.number}",
            quote.title,
            _money(invoice.amount),
            document_id=invoice.id,
            occurred_on=invoice.issued_on,
        )
    db.commit()
    db.refresh(invoice)
    return _document_out(db, invoice)


@router.post("/quotes/{quote_id}/duplicate", response_model=DocumentOut, status_code=201)
def duplicate_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "quotes")
    quote = (
        db.query(PracticeDocument)
        .filter(
            PracticeDocument.id == quote_id,
            PracticeDocument.user_profile_id == profile_id,
            PracticeDocument.kind == DocumentKind.QUOTE.value,
        )
        .first()
    )
    if not quote:
        raise HTTPException(404, "Quote not found")
    profile = db.get(UserProfile, profile_id)
    copy = PracticeDocument(
        user_profile_id=profile_id,
        kind=DocumentKind.QUOTE.value,
        number=take_number(db, profile_id, DocumentKind.QUOTE.value),
        title=quote.title,
        amount=_money(quote.amount),
        issued_on=date.today(),
        due_on=None,
        party_id=quote.party_id,
        project_id=quote.project_id,
        income_ledger_id=None,
        source_quote_id=None,
        status=DocumentStatus.DRAFT.value,
        notes=quote.notes,
        notes_json=getattr(quote, "notes_json", None),
        issuer_snapshot=_issuer_card(db, profile).model_dump() if profile else quote.issuer_snapshot,
        client_snapshot=quote.client_snapshot,
    )
    db.add(copy)
    db.flush()
    tmpl = get_or_create_template(db, profile_id, "quote")
    settings = get_or_create_settings(db, profile_id)
    if quote.lines:
        subtotal = _replace_lines(
            db,
            copy,
            [
                DocumentLineIn(
                    item=getattr(ln, "item", "") or "",
                    description=ln.description,
                    quantity=ln.quantity,
                    unit_price=ln.unit_price,
                )
                for ln in quote.lines
            ],
        )
    else:
        subtotal = _money(quote.subtotal or quote.amount)
    _stamp_money(copy, subtotal, tmpl, settings)
    if copy.project_id:
        _trail(
            db,
            profile_id,
            copy.project_id,
            EntryType.QUOTE.value,
            f"Quote {copy.number}",
            copy.title,
            copy.amount,
            document_id=copy.id,
            occurred_on=copy.issued_on,
        )
    db.commit()
    db.refresh(copy)
    return _document_out(db, copy)


@router.get("/expenses", response_model=list[ExpenseOut])
def list_expenses(
    project_id: int | None = None,
    supplier_id: int | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    q = db.query(PracticeExpense).filter(PracticeExpense.user_profile_id == profile_id)
    if project_id is not None:
        q = q.filter(PracticeExpense.project_id == project_id)
    if supplier_id is not None:
        q = q.filter(PracticeExpense.supplier_id == supplier_id)
    if not include_archived:
        q = q.filter(PracticeExpense.is_archived.is_(False))
    return [_expense_out(db, r) for r in q.order_by(PracticeExpense.incurred_on.desc(), PracticeExpense.id.desc()).all()]


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
def create_expense(
    body: ExpenseCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    project = _project(db, profile_id, body.project_id)
    if not project:
        raise HTTPException(400, "Expense must sit on a project file")
    _ledger(db, profile_id, body.ledger_id, expect_type="expense")
    amount = _money(body.amount)
    supplier = _assert_supplier(db, profile_id, body.supplier_id)
    vendor = (supplier.name if supplier else None) or _clean_vendor(body.vendor_name)
    notes = (body.notes or "").strip() or None
    row = PracticeExpense(
        user_profile_id=profile_id,
        project_id=body.project_id,
        ledger_id=body.ledger_id,
        supplier_id=supplier.id if supplier else None,
        description=body.description.strip(),
        vendor_name=vendor,
        amount=amount,
        incurred_on=body.incurred_on or date.today(),
        notes=notes,
    )
    db.add(row)
    db.flush()
    _trail(
        db,
        profile_id,
        project.id,
        EntryType.EXPENSE.value,
        body.description.strip(),
        _expense_trail_body(vendor, notes),
        amount,
        expense_id=row.id,
        occurred_on=row.incurred_on,
    )
    db.commit()
    db.refresh(row)
    return _expense_out(db, row)


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    body: ExpenseUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    row = (
        db.query(PracticeExpense)
        .filter(
            PracticeExpense.id == expense_id,
            PracticeExpense.user_profile_id == profile_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(404, "Expense not found")
    data = body.model_dump(exclude_unset=True)
    if "ledger_id" in data and data["ledger_id"] is not None:
        _ledger(db, profile_id, data["ledger_id"], expect_type="expense")
    if "description" in data and data["description"] is not None:
        data["description"] = data["description"].strip()
    if "supplier_id" in data:
        supplier = _assert_supplier(db, profile_id, data["supplier_id"])
        data["supplier_id"] = supplier.id if supplier else None
        if supplier:
            data["vendor_name"] = supplier.name
        elif "vendor_name" not in data:
            data["vendor_name"] = None
    if "vendor_name" in data and "supplier_id" not in data:
        data["vendor_name"] = _clean_vendor(data["vendor_name"])
    if "notes" in data and data["notes"] is not None:
        data["notes"] = data["notes"].strip() or None
    if "amount" in data and data["amount"] is not None:
        data["amount"] = _money(data["amount"])
    for key, value in data.items():
        setattr(row, key, value)
    _sync_expense_trail(db, profile_id, row)
    project = db.get(PracticeProject, row.project_id)
    if project:
        project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _expense_out(db, row)


def _supplier_spend(db: Session, profile_id: int, party_id: int):
    require_feature(db, profile_id, "projects")
    party = _party(db, profile_id, party_id)
    if not party:
        raise HTTPException(404, "Supplier not found")
    if party.kind != PartyKind.SUPPLIER.value:
        raise HTTPException(400, "Spend statements are for suppliers")
    rows = (
        db.query(PracticeExpense)
        .filter(
            PracticeExpense.user_profile_id == profile_id,
            PracticeExpense.supplier_id == party.id,
            PracticeExpense.is_archived.is_(False),
        )
        .order_by(PracticeExpense.incurred_on.asc(), PracticeExpense.id.asc())
        .all()
    )
    expenses = [_expense_out(db, r) for r in rows]
    spent = sum((_money(r.amount) for r in rows), Decimal("0.00"))
    return party, expenses, _money(spent)


@router.get("/parties/{party_id}/statement", response_model=SupplierStatementOut)
def supplier_statement(
    party_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    party, expenses, spent = _supplier_spend(db, profile_id, party_id)
    return SupplierStatementOut(
        party=PartyOut.model_validate(party),
        expenses=expenses,
        totals=SupplierSpendTotals(spent=spent, count=len(expenses)),
    )


@router.get("/parties/{party_id}/statement/pdf")
def supplier_statement_pdf(
    party_id: int,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    party, expenses, spent = _supplier_spend(db, profile.id, party_id)
    from app.modules.practice.document_pdf import generate_supplier_statement_pdf

    logo, _src = resolve_logo_path(db, profile)
    pdf_bytes = generate_supplier_statement_pdf(
        supplier=PartyOut.model_validate(party).model_dump(),
        expenses=[e.model_dump() for e in expenses],
        spent=spent,
        currency=profile.currency or "ZAR",
        logo_path=str(logo) if logo else None,
        issuer=_issuer_card(db, profile).model_dump(),
    )
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (party.name or "supplier"))[:60]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="supplier_statement_{safe}.pdf"'},
    )


@router.get("/projects/{project_id}/statement", response_model=ProjectStatementOut)
def project_statement(
    project_id: int,
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    require_feature(db, profile.id, "projects")
    project = _project(db, profile.id, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    notes = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.user_profile_id == profile.id,
            PracticeEntry.project_id == project_id,
            PracticeEntry.entry_type == EntryType.NOTE.value,
        )
        .order_by(PracticeEntry.occurred_on.asc(), PracticeEntry.id.asc())
        .all()
    )
    quotes = (
        db.query(PracticeDocument)
        .filter(
            PracticeDocument.user_profile_id == profile.id,
            PracticeDocument.project_id == project_id,
            PracticeDocument.kind == DocumentKind.QUOTE.value,
            PracticeDocument.is_archived.is_(False),
        )
        .order_by(PracticeDocument.issued_on.asc(), PracticeDocument.id.asc())
        .all()
    )
    invoices = (
        db.query(PracticeDocument)
        .filter(
            PracticeDocument.user_profile_id == profile.id,
            PracticeDocument.project_id == project_id,
            PracticeDocument.kind == DocumentKind.INVOICE.value,
            PracticeDocument.is_archived.is_(False),
        )
        .order_by(PracticeDocument.issued_on.asc(), PracticeDocument.id.asc())
        .all()
    )
    expenses = (
        db.query(PracticeExpense)
        .filter(
            PracticeExpense.user_profile_id == profile.id,
            PracticeExpense.project_id == project_id,
            PracticeExpense.is_archived.is_(False),
        )
        .order_by(PracticeExpense.incurred_on.asc(), PracticeExpense.id.asc())
        .all()
    )

    payments = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.user_profile_id == profile.id,
            PracticeEntry.project_id == project_id,
            PracticeEntry.entry_type == EntryType.PAYMENT.value,
        )
        .order_by(PracticeEntry.occurred_on.asc(), PracticeEntry.id.asc())
        .all()
    )

    q_total = sum((_money(d.amount) for d in quotes), Decimal("0.00"))
    i_total = sum((_money(d.amount) for d in invoices), Decimal("0.00"))
    e_total = sum((_money(e.amount) for e in expenses), Decimal("0.00"))
    p_total = sum((_money(p.amount or 0) for p in payments), Decimal("0.00"))

    return ProjectStatementOut(
        project=ProjectOut(
            id=project.id,
            client_id=project.client_id,
            client_name=project.client.name if project.client else None,
            name=project.name,
            reference=project.reference,
            status=project.status,
            started_on=project.started_on,
            due_on=project.due_on,
            summary=project.summary,
            is_archived=project.is_archived,
            entry_count=len(notes) + len(quotes) + len(invoices) + len(expenses) + len(payments),
            created_at=project.created_at,
            updated_at=project.updated_at,
        ),
        notes=[EntryOut.model_validate(n) for n in notes],
        quotes=[_document_out(db, d) for d in quotes],
        invoices=[_document_out(db, d) for d in invoices],
        expenses=[_expense_out(db, e) for e in expenses],
        payments=[EntryOut.model_validate(p) for p in payments],
        totals=StatementTotals(
            quotes=_money(q_total),
            invoices=_money(i_total),
            expenses=_money(e_total),
            net=_money(i_total - e_total),
            payments=_money(p_total),
        ),
        currency=profile.currency or "ZAR",
        has_logo=resolve_logo_path(db, profile)[0] is not None,
    )
