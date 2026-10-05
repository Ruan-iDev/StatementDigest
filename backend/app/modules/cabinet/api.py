"""Cabinet Flow jobcards."""

from __future__ import annotations

import re
from copy import deepcopy
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_active_profile_id
from app.modules.cabinet.models import CabinetJob, CabinetJobLine
from app.modules.cabinet.pricing import CatalogProduct, PriceError, PriceLine, price_lines
from app.modules.cabinet.schemas import (
    JobAssign,
    JobCreate,
    JobLineIn,
    JobLineOut,
    JobOut,
    JobUpdate,
    LabourPreviewIn,
    PricingIn,
    PricingLineIn,
    PricingOut,
    PricingRowOut,
)
from app.modules.cabinet.sheets import piece_count, sheet_count
from app.modules.practice.flags import get_or_create_settings
from app.modules.practice.models import PartyKind, PracticeParty, PracticeProduct, PracticeProject
from app.modules.practice.templates import resolve_vat
from app.services.money import to_decimal

router = APIRouter(prefix="/cabinet", tags=["cabinet"])

SHEET_HOSTS = ("timber", "square_meter", "quantitative")
MAX_PIECES = 2000


def _client(db: Session, profile_id: int, party_id: int) -> PracticeParty:
    row = (
        db.query(PracticeParty)
        .filter(PracticeParty.id == party_id, PracticeParty.user_profile_id == profile_id)
        .first()
    )
    if not row or row.kind != PartyKind.CLIENT.value:
        raise HTTPException(404, "Client not found")
    return row


def _next_number(db: Session, profile_id: int) -> str:
    rows = db.query(CabinetJob.number).filter(CabinetJob.user_profile_id == profile_id).all()
    max_n = 0
    for (num,) in rows:
        match = re.match(r"^JC-(\d+)$", (num or "").strip().upper())
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"JC-{max_n + 1:03d}"


def _mm_text(value: Decimal) -> str:
    text = format(Decimal(value).quantize(Decimal("0.01")), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _reject_oversize(
    name: str,
    max_length: Decimal | None,
    max_width: Decimal | None,
    length_mm: Decimal | None,
    width_mm: Decimal | None,
) -> None:
    """Refuse a piece that is longer or wider than the product's maximum."""
    too_long = max_length is not None and max_length > 0 and length_mm is not None and length_mm > max_length
    too_wide = max_width is not None and max_width > 0 and width_mm is not None and width_mm > max_width
    if not too_long and not too_wide:
        return
    if max_length is not None and max_length > 0 and max_width is not None and max_width > 0:
        limit = f"{_mm_text(max_length)} × {_mm_text(max_width)} mm"
    elif max_length is not None and max_length > 0:
        limit = f"{_mm_text(max_length)} mm long"
    elif max_width is not None and max_width > 0:
        limit = f"{_mm_text(max_width)} mm wide"
    else:
        limit = ""
    detail = f"{name} is past its maximum of {limit}. It cannot be added." if limit else f"{name} is past its maximum. It cannot be added."
    raise HTTPException(400, detail)


def _basis(family: str, price_basis: str | None) -> str:
    raw = (price_basis or "").strip().lower()
    if family in ("timber", "square_meter"):
        if raw in ("whole", "square_meter"):
            return raw
        return "square_meter" if family == "square_meter" else "whole"
    if family == "linear_meter":
        if raw in ("unit", "meter"):
            return raw
        return "meter"
    return "whole"


def _measure(
    family: str,
    price_basis: str | None,
    qty: Decimal,
    length_mm: Decimal | None,
    width_mm: Decimal | None,
) -> Decimal:
    basis = _basis(family, price_basis)
    if basis == "square_meter":
        if length_mm is None or width_mm is None or length_mm <= 0 or width_mm <= 0:
            raise HTTPException(400, "This product is priced per square metre and needs a length and a width")
        return qty * (length_mm / Decimal(1000)) * (width_mm / Decimal(1000))
    if basis == "meter":
        if length_mm is None or length_mm <= 0:
            raise HTTPException(400, "This product is priced per metre and needs a length")
        return qty * (length_mm / Decimal(1000))
    return qty


def _priced(measure: Decimal, unit: Decimal, vat_on: bool, vat_rate: Decimal):
    ex = (measure * unit).quantize(Decimal("0.01"))
    rate = vat_rate if vat_on else Decimal("0")
    vat = (ex * rate / Decimal(100)).quantize(Decimal("0.01")) if vat_on else Decimal("0.00")
    total = (ex + vat).quantize(Decimal("0.01"))
    return rate, ex, vat, total


def _product(db: Session, profile_id: int, product_id: int) -> PracticeProduct:
    product = (
        db.query(PracticeProduct)
        .filter(PracticeProduct.id == product_id, PracticeProduct.user_profile_id == profile_id)
        .first()
    )
    if not product or product.is_archived:
        raise HTTPException(404, "Product not found")
    return product


def _sheet_pieces(product: PracticeProduct, raws: list[JobLineIn]) -> list[tuple[Decimal, Decimal]]:
    pieces: list[tuple[Decimal, Decimal]] = []
    for raw in raws:
        length = to_decimal(raw.length_mm) if raw.length_mm is not None else None
        width = to_decimal(raw.width_mm) if raw.width_mm is not None else None
        if length is None or width is None or length <= 0 or width <= 0:
            raise HTTPException(400, f"{product.name} is Cut and Edge and needs a length and a width")
        count = piece_count(to_decimal(raw.quantity))
        pieces.extend((length, width) for _ in range(count))
    if len(pieces) > MAX_PIECES:
        raise HTTPException(400, "That is too many pieces to place on sheets at once")
    return pieces


def _cutting_labour(
    db: Session,
    profile_id: int,
    raws: list[JobLineIn],
    vat_on: bool,
    vat_rate: Decimal,
) -> list[CabinetJobLine]:
    grouped: dict[int, list[JobLineIn]] = {}
    products: dict[int, PracticeProduct] = {}
    for raw in raws:
        product = products.get(raw.product_id)
        if product is None:
            product = _product(db, profile_id, raw.product_id)
            products[product.id] = product
        if (product.family or "") not in SHEET_HOSTS or not product.cut_and_edge:
            continue
        if not product.linked_labour:
            continue
        grouped.setdefault(product.id, []).append(raw)

    labour_lines: list[CabinetJobLine] = []
    for product_id, items in grouped.items():
        product = products[product_id]
        pieces = _sheet_pieces(product, items)
        sheets = sheet_count(product.max_length_mm, product.max_width_mm, pieces)
        if sheets <= 0:
            continue
        sheet_word = "sheet" if sheets == 1 else "sheets"
        for link in product.linked_labour or []:
            if not isinstance(link, dict):
                continue
            labour_id = link.get("labour_product_id")
            if labour_id is None:
                continue
            labour = (
                db.query(PracticeProduct)
                .filter(
                    PracticeProduct.id == int(labour_id),
                    PracticeProduct.user_profile_id == profile_id,
                    PracticeProduct.family == "labour",
                )
                .first()
            )
            if not labour or labour.is_archived:
                continue
            qty = (to_decimal(link.get("quantity")) * Decimal(sheets)).quantize(Decimal("0.001"))
            if qty <= 0:
                continue
            unit = to_decimal(labour.retail_price).quantize(Decimal("0.01"))
            rate, ex, vat, total = _priced(qty, unit, vat_on, vat_rate)
            labour_lines.append(
                CabinetJobLine(
                    product_id=labour.id,
                    sort_order=0,
                    quantity=qty,
                    name=labour.name,
                    family=labour.family or "labour",
                    group_name=(labour.category or "").strip() or None,
                    source_product_id=product.id,
                    detail=f"{sheets} {sheet_word} of {product.name}",
                    unit_price=unit,
                    vat_rate=rate,
                    line_ex_vat=ex,
                    vat_amount=vat,
                    line_total=total,
                )
            )
    return labour_lines


def _with_cutting_labour(parts: list[CabinetJobLine], labour: list[CabinetJobLine]) -> list[CabinetJobLine]:
    grouped: dict[int, list[CabinetJobLine]] = {}
    for line in labour:
        if line.source_product_id is None:
            continue
        grouped.setdefault(line.source_product_id, []).append(line)
    last: dict[int, int] = {}
    for index, part in enumerate(parts):
        if part.product_id is not None:
            last[part.product_id] = index
    merged: list[CabinetJobLine] = []
    for index, part in enumerate(parts):
        merged.append(part)
        if part.product_id is not None and last.get(part.product_id) == index:
            merged.extend(grouped.get(part.product_id, []))
    return merged


def _bundle_path(raw: object) -> list | None:
    """Outermost group first. Blank names and repeated keys are dropped."""
    if not isinstance(raw, list):
        return None
    cleaned: list[dict] = []
    seen: set[str] = set()
    for item in raw[:8]:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()[:40]
        name = str(item.get("name") or "").strip()[:120]
        if not key or not name or key in seen:
            continue
        seen.add(key)
        collapsed = item.get("collapsed")
        cleaned.append({"key": key, "name": name, "collapsed": collapsed is True or collapsed == 1})
    return cleaned or None


def _arrange_lines(
    db: Session,
    profile_id: int,
    raws: list[JobLineIn],
    vat_on: bool,
    vat_rate: Decimal,
) -> list[CabinetJobLine]:
    """Keep the client's order. Cutting labour is only kept where the client left a slot."""
    part_raws = [raw for raw in raws if raw.source_product_id is None]
    parts: list[CabinetJobLine] = []
    for index, raw in enumerate(part_raws):
        line = _build_line(db, profile_id, raw, index, vat_on, vat_rate)
        line.bundle_path = _bundle_path(raw.bundle_path)
        parts.append(line)
    pool = list(_cutting_labour(db, profile_id, part_raws, vat_on, vat_rate))
    arranged: list[CabinetJobLine] = []
    part_index = 0
    for raw in raws:
        if raw.source_product_id is None:
            arranged.append(parts[part_index])
            part_index += 1
            continue
        match_at = next(
            (
                index
                for index, line in enumerate(pool)
                if line.source_product_id == raw.source_product_id and line.product_id == raw.product_id
            ),
            None,
        )
        if match_at is None:
            continue
        match = pool.pop(match_at)
        match.bundle_path = _bundle_path(raw.bundle_path)
        arranged.append(match)
    return arranged


def _replace_lines(
    db: Session,
    profile_id: int,
    raws: list[JobLineIn],
    arrange: bool,
    vat_on: bool,
    vat_rate: Decimal,
) -> list[CabinetJobLine]:
    part_raws = [raw for raw in raws if raw.source_product_id is None]
    if arrange:
        return _arrange_lines(db, profile_id, raws, vat_on, vat_rate)
    parts = [_build_line(db, profile_id, raw, index, vat_on, vat_rate) for index, raw in enumerate(part_raws)]
    return _with_cutting_labour(parts, _cutting_labour(db, profile_id, part_raws, vat_on, vat_rate))


def _line_out(line: CabinetJobLine, line_id: int | None = None) -> JobLineOut:
    return JobLineOut(
        id=line.id if line_id is None else line_id,
        product_id=line.product_id,
        sort_order=0 if line.sort_order is None else line.sort_order,
        quantity=line.quantity,
        name=line.name,
        family=line.family,
        group_name=line.group_name,
        length_mm=line.length_mm,
        width_mm=line.width_mm,
        source_product_id=line.source_product_id,
        detail=line.detail,
        bundle_path=line.bundle_path if isinstance(line.bundle_path, list) else None,
        unit_price=line.unit_price,
        vat_rate=line.vat_rate,
        line_ex_vat=line.line_ex_vat,
        vat_amount=line.vat_amount,
        line_total=line.line_total,
    )


def _build_line(
    db: Session,
    profile_id: int,
    raw: JobLineIn,
    order: int,
    vat_on: bool,
    vat_rate: Decimal,
) -> CabinetJobLine:
    product = _product(db, profile_id, raw.product_id)
    qty = to_decimal(raw.quantity)
    if qty <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")
    length = to_decimal(raw.length_mm) if raw.length_mm is not None else None
    width = to_decimal(raw.width_mm) if raw.width_mm is not None else None
    if (product.family or "") in SHEET_HOSTS and product.cut_and_edge:
        if length is None or width is None or length <= 0 or width <= 0:
            raise HTTPException(400, f"{product.name} is Cut and Edge and needs a length and a width")
    _reject_oversize(product.name, product.max_length_mm, product.max_width_mm, length, width)
    unit = to_decimal(product.retail_price).quantize(Decimal("0.01"))
    measure = _measure(product.family or "quantitative", product.price_basis, qty, length, width)
    rate, ex, vat, total = _priced(measure, unit, vat_on, vat_rate)
    return CabinetJobLine(
        product_id=product.id,
        sort_order=order,
        quantity=qty.quantize(Decimal("0.001")),
        name=product.name,
        family=product.family or "quantitative",
        group_name=(product.category or "").strip() or None,
        length_mm=length,
        width_mm=width,
        unit_price=unit,
        vat_rate=rate,
        line_ex_vat=ex,
        vat_amount=vat,
        line_total=total,
    )


def _catalog(product: PracticeProduct) -> CatalogProduct:
    return CatalogProduct(
        id=product.id,
        name=product.name,
        family=product.family or "quantitative",
        price_basis=product.price_basis,
        cut_and_edge=bool(product.cut_and_edge),
        max_length_mm=product.max_length_mm,
        max_width_mm=product.max_width_mm,
        retail_price=product.retail_price,
        archived=bool(product.is_archived),
    )


def _price_line(raw: PricingLineIn | CabinetJobLine) -> PriceLine:
    return PriceLine(
        product_id=int(raw.product_id or 0),
        quantity=to_decimal(raw.quantity),
        length_mm=to_decimal(raw.length_mm) if raw.length_mm is not None else None,
        width_mm=to_decimal(raw.width_mm) if raw.width_mm is not None else None,
        source_product_id=raw.source_product_id,
        detail=getattr(raw, "detail", None),
        unit_price=to_decimal(raw.unit_price) if getattr(raw, "unit_price", None) is not None else None,
        name=getattr(raw, "name", None),
        family=getattr(raw, "family", None),
    )


def _catalogs(db: Session, profile_id: int, product_ids: set[int]) -> dict[int, CatalogProduct]:
    if not product_ids:
        return {}
    rows = (
        db.query(PracticeProduct)
        .filter(PracticeProduct.user_profile_id == profile_id, PracticeProduct.id.in_(product_ids))
        .all()
    )
    return {row.id: _catalog(row) for row in rows}


def _priced_totals(db: Session, profile_id: int, lines: list[CabinetJobLine], vat_on: bool, vat_rate: Decimal):
    usable = [line for line in lines if line.product_id]
    try:
        _rows, ex, vat, total = price_lines(
            [_price_line(line) for line in usable],
            _catalogs(db, profile_id, {int(line.product_id) for line in usable}),
            vat_on,
            vat_rate,
            strict=False,
        )
        return ex, vat, total
    except PriceError:
        ex = sum((line.line_ex_vat for line in lines), Decimal("0.00"))
        vat = sum((line.vat_amount for line in lines), Decimal("0.00"))
        return ex.quantize(Decimal("0.01")), vat.quantize(Decimal("0.01")), (ex + vat).quantize(Decimal("0.01"))


def _job_out(db: Session, profile_id: int, row: CabinetJob, client_name: str, vat_on: bool, vat_rate: Decimal) -> JobOut:
    lines = [_line_out(line) for line in row.lines]
    ex, vat, total = _priced_totals(db, profile_id, list(row.lines), vat_on, vat_rate)
    return JobOut(
        id=row.id,
        number=row.number,
        party_id=row.party_id,
        client_name=client_name,
        project_id=row.project_id,
        job_reference=row.job_reference,
        vat_enabled=vat_on,
        vat_rate=vat_rate if vat_on else Decimal("0"),
        lines=lines,
        ex_vat=ex,
        vat=vat,
        total=total,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _load(db: Session, profile_id: int, job_id: int) -> CabinetJob:
    row = (
        db.query(CabinetJob)
        .options(joinedload(CabinetJob.lines))
        .filter(CabinetJob.id == job_id, CabinetJob.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Jobcard not found")
    return row


def _project_for_job(db: Session, profile_id: int, project_id: int, party_id: int) -> PracticeProject:
    project = (
        db.query(PracticeProject)
        .filter(PracticeProject.id == project_id, PracticeProject.user_profile_id == profile_id)
        .first()
    )
    if not project:
        raise HTTPException(404, "Project not found")
    if project.client_id is None:
        raise HTTPException(400, "This project has no client")
    if project.client_id != party_id:
        raise HTTPException(400, "This jobcard belongs to a different client")
    return project


def _present(db: Session, profile_id: int, row: CabinetJob) -> JobOut:
    client = _client(db, profile_id, row.party_id)
    settings = get_or_create_settings(db, profile_id)
    vat_on, vat_rate = resolve_vat(settings)
    return _job_out(db, profile_id, row, client.name, vat_on, vat_rate)


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(
    party_id: int | None = Query(default=None),
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    query = (
        db.query(CabinetJob)
        .options(joinedload(CabinetJob.lines))
        .filter(CabinetJob.user_profile_id == profile_id)
    )
    if party_id is not None:
        query = query.filter(CabinetJob.party_id == party_id)
    if project_id is not None:
        query = query.filter(CabinetJob.project_id == project_id)
    found: list[CabinetJob] = []
    seen: set[int] = set()
    for row in query.order_by(CabinetJob.id.desc()).all():
        if row.id in seen:
            continue
        seen.add(row.id)
        found.append(row)
    return [_present(db, profile_id, row) for row in found]


@router.post("/jobs", response_model=JobOut, status_code=201)
def create_job(
    body: JobCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    _client(db, profile_id, body.party_id)
    row = CabinetJob(
        user_profile_id=profile_id,
        number=_next_number(db, profile_id),
        party_id=body.party_id,
    )
    db.add(row)
    db.commit()
    return _present(db, profile_id, _load(db, profile_id, row.id))


@router.post("/jobs/assign", response_model=list[JobOut])
def assign_jobs(
    body: JobAssign,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    ids = list(dict.fromkeys(body.job_ids))
    rows = (
        db.query(CabinetJob)
        .filter(CabinetJob.user_profile_id == profile_id, CabinetJob.id.in_(ids))
        .all()
    )
    found = {row.id: row for row in rows}
    missing = [job_id for job_id in ids if job_id not in found]
    if missing:
        raise HTTPException(404, "Jobcard not found")
    for row in rows:
        _project_for_job(db, profile_id, body.project_id, row.party_id)
        row.project_id = body.project_id
    db.commit()
    return [_present(db, profile_id, _load(db, profile_id, job_id)) for job_id in ids]


@router.post("/jobs/labour-preview", response_model=list[JobLineOut])
def labour_preview(
    body: LabourPreviewIn,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    settings = get_or_create_settings(db, profile_id)
    vat_on, vat_rate = resolve_vat(settings)
    raws = list(body.lines)
    for index, raw in enumerate(raws):
        _build_line(db, profile_id, raw, index, vat_on, vat_rate)
    labour = _cutting_labour(db, profile_id, raws, vat_on, vat_rate)
    return [_line_out(line, -(index + 1)) for index, line in enumerate(labour)]


@router.post("/jobs/pricing", response_model=PricingOut)
def pricing_preview(
    body: PricingIn,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    settings = get_or_create_settings(db, profile_id)
    vat_on, vat_rate = resolve_vat(settings)
    raws = [raw for raw in body.lines if raw.product_id]
    try:
        rows, ex, vat, total = price_lines(
            [_price_line(raw) for raw in raws],
            _catalogs(db, profile_id, {raw.product_id for raw in raws}),
            vat_on,
            vat_rate,
            strict=True,
        )
    except PriceError as exc:
        raise HTTPException(400, exc.message) from exc
    return PricingOut(
        rows=[
            PricingRowOut(
                product_id=row.product_id,
                name=row.name,
                family=row.family,
                detail=row.detail,
                quantity=row.quantity,
                unit_label=row.unit_label,
                unit_price=row.unit_price,
                line_ex_vat=row.line_ex_vat,
                vat_amount=row.vat_amount,
                line_total=row.line_total,
            )
            for row in rows
        ],
        ex_vat=ex,
        vat=vat,
        total=total,
    )


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _present(db, profile_id, _load(db, profile_id, job_id))


@router.patch("/jobs/{job_id}", response_model=JobOut)
def update_job(
    job_id: int,
    body: JobUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _load(db, profile_id, job_id)
    data = body.model_dump(exclude_unset=True)
    if "party_id" in data and data["party_id"] is not None:
        _client(db, profile_id, data["party_id"])
        row.party_id = data["party_id"]
    if "job_reference" in data:
        ref = (data["job_reference"] or "").strip()
        row.job_reference = ref or None
    if "project_id" in data:
        if data["project_id"] is None:
            row.project_id = None
        else:
            _project_for_job(db, profile_id, data["project_id"], row.party_id)
            row.project_id = data["project_id"]
    if "lines" in data and data["lines"] is not None:
        settings = get_or_create_settings(db, profile_id)
        vat_on, vat_rate = resolve_vat(settings)
        raws = list(body.lines or [])
        merged = _replace_lines(db, profile_id, raws, bool(body.arrange), vat_on, vat_rate)
        row.lines.clear()
        for index, line in enumerate(merged):
            line.sort_order = index
            row.lines.append(line)
    db.commit()
    return _present(db, profile_id, _load(db, profile_id, row.id))


@router.post("/jobs/{job_id}/duplicate", response_model=JobOut, status_code=201)
def duplicate_job(
    job_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    source = _load(db, profile_id, job_id)
    copy = CabinetJob(
        user_profile_id=profile_id,
        number=_next_number(db, profile_id),
        party_id=source.party_id,
        project_id=source.project_id,
        job_reference=source.job_reference,
    )
    for line in source.lines:
        copy.lines.append(
            CabinetJobLine(
                product_id=line.product_id,
                sort_order=line.sort_order,
                quantity=line.quantity,
                name=line.name,
                family=line.family,
                group_name=line.group_name,
                length_mm=line.length_mm,
                width_mm=line.width_mm,
                source_product_id=line.source_product_id,
                detail=line.detail,
                bundle_path=deepcopy(line.bundle_path) if line.bundle_path else None,
                unit_price=line.unit_price,
                vat_rate=line.vat_rate,
                line_ex_vat=line.line_ex_vat,
                vat_amount=line.vat_amount,
                line_total=line.line_total,
            )
        )
    db.add(copy)
    db.commit()
    return _present(db, profile_id, _load(db, profile_id, copy.id))


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _load(db, profile_id, job_id)
    db.delete(row)
    db.commit()
    return Response(status_code=204)
