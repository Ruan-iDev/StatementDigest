"""Practice API — isolated from statement/ledger routes."""

from __future__ import annotations

import re
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile, get_active_profile_id
from app.models import UserProfile
from app.modules.practice.manifest import MANIFEST
from app.modules.practice.commerce import router as commerce_router, sync_invoice_payment_status
from app.modules.practice.staff import router as staff_router
from app.modules.practice.products import router as products_router
from app.modules.practice.templates import router as templates_router
from app.modules.practice.flags import get_or_create_settings, require_feature
from app.modules.practice.models import (
    DocumentKind,
    EntryType,
    PartyKind,
    PracticeDocument,
    PracticeEntry,
    PracticeExpense,
    PracticeParty,
    PracticeProject,
    PracticeStaff,
    PracticeProduct,
    PracticeWage,
    ProjectStatus,
)
from app.modules.practice.overview import build_workflow_overview, build_workflow_report
from app.modules.practice.schemas import (
    EntryCreate,
    EntryOut,
    EntryUpdate,
    FeatureFlagsOut,
    FeatureFlagsUpdate,
    PartyCreate,
    PartyOut,
    PartyUpdate,
    PracticeStatusOut,
    ProjectCreate,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdate,
    WorkflowOverviewOut,
    WorkflowReportOut,
)

router = APIRouter(prefix="/practice", tags=["practice"])
router.include_router(templates_router)
router.include_router(commerce_router)
router.include_router(staff_router)
router.include_router(products_router)

_PARTY_KINDS = {k.value for k in PartyKind}
_PROJECT_STATUSES = {s.value for s in ProjectStatus}
_USER_ENTRY_TYPES = {
    EntryType.NOTE.value,
    EntryType.TASK.value,
    EntryType.PAYMENT.value,
    EntryType.MEETING.value,
}
_ALL_ENTRY_TYPES = {e.value for e in EntryType}


def _party_out(row: PracticeParty) -> PartyOut:
    return PartyOut.model_validate(row)


def _project_out(row: PracticeProject, entry_count: int = 0) -> ProjectOut:
    return ProjectOut(
        id=row.id,
        client_id=row.client_id,
        client_name=row.client.name if row.client else None,
        name=row.name,
        reference=row.reference,
        status=row.status,
        started_on=row.started_on,
        due_on=row.due_on,
        summary=row.summary,
        is_archived=row.is_archived,
        entry_count=entry_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_party(db: Session, profile_id: int, party_id: int) -> PracticeParty:
    row = (
        db.query(PracticeParty)
        .filter(PracticeParty.id == party_id, PracticeParty.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Client or supplier not found")
    return row


def _get_project(db: Session, profile_id: int, project_id: int) -> PracticeProject:
    row = (
        db.query(PracticeProject)
        .filter(PracticeProject.id == project_id, PracticeProject.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Project not found")
    return row


def _assert_client(db: Session, profile_id: int, client_id: int | None) -> None:
    if client_id is None:
        return
    party = _get_party(db, profile_id, client_id)
    if party.kind != PartyKind.CLIENT.value:
        raise HTTPException(400, "Project client must be a client (debtor), not a supplier")


_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _clean_time(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if not _TIME_RE.match(raw):
        raise HTTPException(400, "Time must be HH:MM (24-hour)")
    return raw


def _add_entry(
    db: Session,
    profile_id: int,
    project_id: int,
    entry_type: str,
    title: str,
    body: str | None = None,
    amount=None,
    document_id: int | None = None,
    occurred_on: date | None = None,
    occurred_time: str | None = None,
    *,
    stamp_date: bool = True,
) -> PracticeEntry:
    row = PracticeEntry(
        user_profile_id=profile_id,
        project_id=project_id,
        entry_type=entry_type,
        title=title,
        body=body,
        amount=amount,
        document_id=document_id,
        occurred_on=(
            occurred_on
            if occurred_on is not None
            else (date.today() if stamp_date else None)
        ),
        occurred_time=occurred_time,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    return row


def _entry_count(db: Session, profile_id: int, project_id: int) -> int:
    return (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.user_profile_id == profile_id,
            PracticeEntry.project_id == project_id,
        )
        .count()
    )


@router.get("/status", response_model=PracticeStatusOut)
def practice_status(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    def _count(model, *extra):
        q = db.query(model).filter(model.user_profile_id == profile_id, *extra)
        return q.count()

    return PracticeStatusOut(
        module=MANIFEST.id,
        version=MANIFEST.version,
        client_count=_count(
            PracticeParty,
            PracticeParty.kind == PartyKind.CLIENT.value,
            PracticeParty.is_archived.is_(False),
        ),
        supplier_count=_count(
            PracticeParty,
            PracticeParty.kind == PartyKind.SUPPLIER.value,
            PracticeParty.is_archived.is_(False),
        ),
        staff_count=_count(PracticeStaff, PracticeStaff.is_archived.is_(False)),
        product_count=_count(PracticeProduct, PracticeProduct.is_archived.is_(False)),
        project_count=_count(PracticeProject, PracticeProject.is_archived.is_(False)),
        open_project_count=_count(
            PracticeProject,
            PracticeProject.is_archived.is_(False),
            PracticeProject.status == ProjectStatus.OPEN.value,
        ),
        entry_count=_count(PracticeEntry),
        quote_count=_count(
            PracticeDocument,
            PracticeDocument.kind == DocumentKind.QUOTE.value,
            PracticeDocument.is_archived.is_(False),
        ),
        invoice_count=_count(
            PracticeDocument,
            PracticeDocument.kind == DocumentKind.INVOICE.value,
            PracticeDocument.is_archived.is_(False),
        ),
    )


@router.get("/overview", response_model=WorkflowOverviewOut)
def practice_overview(
    fy_start_year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return build_workflow_overview(db, profile, fy_start_year=fy_start_year)


@router.get("/reports", response_model=WorkflowReportOut)
def practice_reports(
    fy_start_year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    profile: UserProfile = Depends(get_active_profile),
):
    return build_workflow_report(db, profile, fy_start_year=fy_start_year)


@router.get("/flags", response_model=FeatureFlagsOut)
def get_flags(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = get_or_create_settings(db, profile_id)
    return FeatureFlagsOut(
        quotes_enabled=row.quotes_enabled,
        invoices_enabled=row.invoices_enabled,
        projects_enabled=row.projects_enabled,
    )


@router.patch("/flags", response_model=FeatureFlagsOut)
def update_flags(
    body: FeatureFlagsUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = get_or_create_settings(db, profile_id)
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            setattr(row, key, bool(value))
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return FeatureFlagsOut(
        quotes_enabled=row.quotes_enabled,
        invoices_enabled=row.invoices_enabled,
        projects_enabled=row.projects_enabled,
    )


@router.get("/parties", response_model=list[PartyOut])
def list_parties(
    kind: str | None = Query(default=None, pattern="^(client|supplier)$"),
    include_archived: bool = False,
    q: str | None = Query(default=None, description="Search name, contact, email, city, VAT"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    query = db.query(PracticeParty).filter(PracticeParty.user_profile_id == profile_id)
    if kind:
        query = query.filter(PracticeParty.kind == kind)
    if not include_archived:
        query = query.filter(PracticeParty.is_archived.is_(False))
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                PracticeParty.name.ilike(like),
                PracticeParty.trading_name.ilike(like),
                PracticeParty.contact_name.ilike(like),
                PracticeParty.email.ilike(like),
                PracticeParty.phone.ilike(like),
                PracticeParty.city.ilike(like),
                PracticeParty.vat_number.ilike(like),
                PracticeParty.business_registration_number.ilike(like),
            )
        )
    rows = query.order_by(PracticeParty.name.asc()).limit(limit).all()
    return [_party_out(r) for r in rows]


@router.post("/parties", response_model=PartyOut, status_code=201)
def create_party(
    body: PartyCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    if body.kind not in _PARTY_KINDS:
        raise HTTPException(400, "kind must be client or supplier")
    party_type = (body.party_type or "individual").strip()
    if party_type not in ("individual", "business"):
        raise HTTPException(400, "party_type must be individual or business")
    row = PracticeParty(
        user_profile_id=profile_id,
        kind=body.kind,
        party_type=party_type,
        name=body.name.strip(),
        business_registration_number=body.business_registration_number,
        trading_name=body.trading_name,
        contact_name=body.contact_name,
        email=body.email,
        phone=body.phone,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        postal_code=body.postal_code,
        country=body.country or "South Africa",
        tax_number=body.tax_number,
        vat_number=body.vat_number,
        notes=body.notes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _party_out(row)


@router.get("/parties/{party_id}", response_model=PartyOut)
def get_party(
    party_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _party_out(_get_party(db, profile_id, party_id))


@router.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    party_id: int,
    body: PartyUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_party(db, profile_id, party_id)
    data = body.model_dump(exclude_unset=True)
    if "party_type" in data and data["party_type"] is not None:
        if data["party_type"] not in ("individual", "business"):
            raise HTTPException(400, "party_type must be individual or business")
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _party_out(row)


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    include_archived: bool = False,
    client_id: int | None = None,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    q = db.query(PracticeProject).filter(PracticeProject.user_profile_id == profile_id)
    if not include_archived:
        q = q.filter(PracticeProject.is_archived.is_(False))
    if client_id is not None:
        q = q.filter(PracticeProject.client_id == client_id)
    rows = q.order_by(
        PracticeProject.reference.asc(),
        PracticeProject.name.asc(),
        PracticeProject.id.asc(),
    ).all()
    return [_project_out(r, _entry_count(db, profile_id, r.id)) for r in rows]


@router.post("/projects", response_model=ProjectDetailOut, status_code=201)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    status = (body.status or ProjectStatus.OPEN.value).strip()
    if status not in _PROJECT_STATUSES:
        raise HTTPException(400, "Invalid project status")
    _assert_client(db, profile_id, body.client_id)
    row = PracticeProject(
        user_profile_id=profile_id,
        client_id=body.client_id,
        name=body.name.strip(),
        reference=(body.reference or "").strip() or None,
        status=status,
        started_on=body.started_on,
        due_on=body.due_on,
        summary=body.summary,
    )
    db.add(row)
    db.flush()
    _add_entry(
        db, profile_id, row.id, EntryType.STATUS.value, "Project opened", stamp_date=False
    )
    db.commit()
    db.refresh(row)
    return get_project(row.id, db, profile_id)


@router.get("/projects/{project_id}", response_model=ProjectDetailOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_project(db, profile_id, project_id)
    entries = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.user_profile_id == profile_id,
            PracticeEntry.project_id == project_id,
        )
        .order_by(
            case(
                (
                    (PracticeEntry.entry_type == EntryType.STATUS.value)
                    & (PracticeEntry.title == "Project opened"),
                    0,
                ),
                else_=1,
            ),
            PracticeEntry.occurred_on.asc(),
            PracticeEntry.created_at.asc(),
            PracticeEntry.id.asc(),
        )
        .all()
    )
    base = _project_out(row, len(entries))
    return ProjectDetailOut(
        **base.model_dump(),
        entries=[EntryOut.model_validate(e) for e in entries],
    )


@router.patch("/projects/{project_id}", response_model=ProjectDetailOut)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    row = _get_project(db, profile_id, project_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] is not None:
        if data["status"] not in _PROJECT_STATUSES:
            raise HTTPException(400, "Invalid project status")
    if "client_id" in data:
        _assert_client(db, profile_id, data["client_id"])
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "reference" in data and data["reference"] is not None:
        data["reference"] = data["reference"].strip() or None

    old_status = row.status
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()

    if "status" in data and data["status"] and data["status"] != old_status:
        label = data["status"].replace("_", " ")
        _add_entry(db, profile_id, row.id, EntryType.STATUS.value, f"Status → {label}")

    db.commit()
    return get_project(project_id, db, profile_id)


@router.post("/projects/{project_id}/entries", response_model=EntryOut, status_code=201)
def add_entry(
    project_id: int,
    body: EntryCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    _get_project(db, profile_id, project_id)
    entry_type = (body.entry_type or EntryType.NOTE.value).strip()
    if entry_type not in _ALL_ENTRY_TYPES:
        raise HTTPException(400, "Unknown entry type")
    if entry_type not in _USER_ENTRY_TYPES:
        raise HTTPException(
            400,
            "This add type is reserved for a later Practice slice (quotes, invoices, files).",
        )
    amount = body.amount
    document_id = body.document_id
    if entry_type == EntryType.MEETING.value:
        if not body.title.strip():
            raise HTTPException(400, "A meeting needs a title")
    if entry_type == EntryType.PAYMENT.value:
        if amount is None:
            raise HTTPException(400, "A received payment needs an amount")
        if document_id is not None:
            inv = (
                db.query(PracticeDocument)
                .filter(
                    PracticeDocument.id == document_id,
                    PracticeDocument.user_profile_id == profile_id,
                    PracticeDocument.project_id == project_id,
                    PracticeDocument.kind == DocumentKind.INVOICE.value,
                )
                .first()
            )
            if not inv:
                raise HTTPException(404, "Invoice not found on this project file")
    row = _add_entry(
        db,
        profile_id,
        project_id,
        entry_type,
        body.title.strip(),
        body.body,
        amount=amount,
        document_id=document_id,
        occurred_on=body.occurred_on,
        occurred_time=_clean_time(body.occurred_time),
    )
    db.flush()
    if entry_type == EntryType.PAYMENT.value:
        sync_invoice_payment_status(db, profile_id, document_id)
    # Touch project so it sorts to the top of the library
    project = _get_project(db, profile_id, project_id)
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return EntryOut.model_validate(row)


@router.patch("/projects/{project_id}/entries/{entry_id}", response_model=EntryOut)
def update_entry(
    project_id: int,
    entry_id: int,
    body: EntryUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    require_feature(db, profile_id, "projects")
    _get_project(db, profile_id, project_id)
    row = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.id == entry_id,
            PracticeEntry.project_id == project_id,
            PracticeEntry.user_profile_id == profile_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(404, "Trail entry not found")
    if row.entry_type == EntryType.STATUS.value:
        raise HTTPException(400, "Status markers on the trail cannot be edited")
    if row.entry_type not in _USER_ENTRY_TYPES:
        raise HTTPException(400, "Open the quote or invoice to change it")
    data = body.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
        if not data["title"]:
            raise HTTPException(400, "Title cannot be blank")
    if "occurred_time" in data:
        data["occurred_time"] = _clean_time(data["occurred_time"])
    if row.entry_type == EntryType.PAYMENT.value and "amount" in data and data["amount"] is None:
        raise HTTPException(400, "A received payment needs an amount")
    if "document_id" in data and data["document_id"] is not None:
        inv = (
            db.query(PracticeDocument)
            .filter(
                PracticeDocument.id == data["document_id"],
                PracticeDocument.user_profile_id == profile_id,
                PracticeDocument.project_id == project_id,
                PracticeDocument.kind == DocumentKind.INVOICE.value,
            )
            .first()
        )
        if not inv:
            raise HTTPException(404, "Invoice not found on this project file")
    old_document_id = row.document_id
    for key, value in data.items():
        setattr(row, key, value)
    if row.entry_type == EntryType.PAYMENT.value:
        db.flush()
        sync_invoice_payment_status(db, profile_id, old_document_id)
        if row.document_id != old_document_id:
            sync_invoice_payment_status(db, profile_id, row.document_id)
    project = _get_project(db, profile_id, project_id)
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return EntryOut.model_validate(row)


@router.delete("/projects/{project_id}/entries/{entry_id}", status_code=204)
def delete_entry(
    project_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    """Remove a paper-trail line. Linked wages and expenses are removed with it."""
    require_feature(db, profile_id, "projects")
    project = _get_project(db, profile_id, project_id)
    row = (
        db.query(PracticeEntry)
        .filter(
            PracticeEntry.id == entry_id,
            PracticeEntry.project_id == project_id,
            PracticeEntry.user_profile_id == profile_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(404, "Trail entry not found")
    if row.entry_type == EntryType.STATUS.value and row.title == "Project opened":
        raise HTTPException(400, "The project-opened marker cannot be removed")
    if row.entry_type in (EntryType.QUOTE.value, EntryType.INVOICE.value):
        raise HTTPException(
            400, "Open the quote or invoice to void it. This trail line is only a link."
        )
    wage_id = row.wage_id
    expense_id = row.expense_id
    payment_document_id = row.document_id if row.entry_type == EntryType.PAYMENT.value else None
    db.delete(row)
    db.flush()
    if payment_document_id:
        sync_invoice_payment_status(db, profile_id, payment_document_id)
    if wage_id:
        wage = (
            db.query(PracticeWage)
            .filter(PracticeWage.id == wage_id, PracticeWage.user_profile_id == profile_id)
            .first()
        )
        if wage:
            db.delete(wage)
    if expense_id:
        expense = (
            db.query(PracticeExpense)
            .filter(PracticeExpense.id == expense_id, PracticeExpense.user_profile_id == profile_id)
            .first()
        )
        if expense:
            db.delete(expense)
    project.updated_at = datetime.utcnow()
    db.commit()
    return None
