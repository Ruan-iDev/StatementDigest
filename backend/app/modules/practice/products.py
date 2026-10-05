"""Product library — reusable quote/invoice lines (goods, labour, and other items)."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.deps import get_active_profile_id
from app.modules.practice.flags import get_or_create_settings
from app.modules.practice.models import PracticeProduct
from app.modules.practice.schemas import (
    ProductCreate,
    ProductLabourLink,
    ProductMarkupDefaultsOut,
    ProductMarkupDefaultUpdate,
    ProductOut,
    ProductUpdate,
)
from app.services.money import to_decimal

router = APIRouter()

PRODUCT_FAMILIES = ("timber", "square_meter", "linear_meter", "quantitative", "labour")
PRICE_BASIS = {
    "timber": ("whole", "square_meter"),
    "square_meter": ("whole", "square_meter"),
    "linear_meter": ("unit", "meter"),
}
DEFAULT_PRICE_BASIS = {
    "timber": "whole",
    "square_meter": "square_meter",
    "linear_meter": "meter",
}
SHEET_HOSTS = ("timber", "square_meter", "quantitative")


def _price_basis(family: str, value: str | None) -> str | None:
    allowed = PRICE_BASIS.get(family)
    if not allowed:
        return None
    raw = (value or "").strip().lower()
    if not raw:
        return DEFAULT_PRICE_BASIS[family]
    if raw not in allowed:
        raise HTTPException(400, "That price does not belong on this product")
    return raw


def _family(value: str | None, *, required: bool = True) -> str | None:
    raw = (value or "").strip().lower()
    if not raw:
        if required:
            return "quantitative"
        return None
    if raw not in PRODUCT_FAMILIES:
        raise HTTPException(400, "Unknown product family")
    return raw


def _money(value) -> Decimal:
    n = to_decimal(value)
    if n < 0:
        raise HTTPException(400, "Prices cannot be negative")
    return n.quantize(Decimal("0.01"))


def _blank(value: str | None) -> str | None:
    raw = (value or "").strip()
    return raw or None


def _mm(value) -> Decimal | None:
    if value is None or value == "":
        return None
    n = to_decimal(value)
    if n < 0:
        raise HTTPException(400, "Sheet sizes cannot be negative")
    if n == 0:
        return None
    return n.quantize(Decimal("0.01"))


def _canonical_category(db: Session, profile_id: int, value: str | None) -> str | None:
    """Reuse an existing category's spelling when the name matches (any case)."""
    name = _blank(value)
    if not name:
        return None
    if len(name) > 80:
        raise HTTPException(400, "Category is too long")
    hit = (
        db.query(PracticeProduct.category)
        .filter(
            PracticeProduct.user_profile_id == profile_id,
            PracticeProduct.category.isnot(None),
            PracticeProduct.category.ilike(name),
        )
        .order_by(PracticeProduct.id.asc())
        .first()
    )
    if hit and hit[0]:
        return hit[0]
    return name


def _percent(value) -> Decimal | None:
    if value is None or value == "":
        return None
    n = to_decimal(value).quantize(Decimal("0.01"))
    return n


def _markup_from_prices(cost: Decimal, retail: Decimal) -> Decimal | None:
    if cost <= 0 or retail == 0:
        return None
    return ((retail - cost) * Decimal("100") / cost).quantize(Decimal("0.01"))


def _retail_from(cost: Decimal, markup: Decimal) -> Decimal:
    return (cost * (1 + markup / Decimal("100"))).quantize(Decimal("0.01"))


def _stored_defaults(db: Session, profile_id: int) -> dict:
    settings = get_or_create_settings(db, profile_id)
    raw = settings.product_markup_defaults or {}
    return raw if isinstance(raw, dict) else {}


def _family_default(db: Session, profile_id: int, family: str) -> Decimal | None:
    return _percent(_stored_defaults(db, profile_id).get(family))


def _defaults_out(db: Session, profile_id: int) -> ProductMarkupDefaultsOut:
    raw = _stored_defaults(db, profile_id)
    return ProductMarkupDefaultsOut(**{name: _percent(raw.get(name)) for name in PRODUCT_FAMILIES})


def _reprice_default_users(db: Session, profile_id: int, family: str, default: Decimal | None) -> None:
    if default is None:
        return
    rows = (
        db.query(PracticeProduct)
        .filter(
            PracticeProduct.user_profile_id == profile_id,
            PracticeProduct.family == family,
            PracticeProduct.markup_percent.is_(None),
        )
        .all()
    )
    for row in rows:
        cost = _money(row.cost_price)
        if cost > 0:
            row.retail_price = _retail_from(cost, default)


def _public_links(raw) -> list[ProductLabourLink]:
    links = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        labour_id = item.get("labour_product_id")
        if labour_id is None:
            continue
        links.append(
            ProductLabourLink(
                labour_product_id=int(labour_id),
                quantity=to_decimal(item.get("quantity")),
                labour_name=(item.get("labour_name") or None),
            )
        )
    return links


def _clean_links(db: Session, profile_id: int, family: str, raw) -> list | None:
    if family not in SHEET_HOSTS:
        return None
    if not raw:
        return None
    cleaned = []
    seen: set[int] = set()
    for item in raw:
        if isinstance(item, dict):
            labour_id = item.get("labour_product_id")
            quantity = item.get("quantity")
        else:
            labour_id = getattr(item, "labour_product_id", None)
            quantity = getattr(item, "quantity", None)
        if labour_id is None:
            raise HTTPException(400, "Choose a labour product")
        labour_id = int(labour_id)
        qty = to_decimal(quantity)
        if qty <= 0:
            raise HTTPException(400, "Labour quantity must be greater than zero")
        if labour_id in seen:
            raise HTTPException(400, "That labour is already linked")
        seen.add(labour_id)
        labour = (
            db.query(PracticeProduct)
            .filter(
                PracticeProduct.id == labour_id,
                PracticeProduct.user_profile_id == profile_id,
                PracticeProduct.family == "labour",
                PracticeProduct.is_archived.is_(False),
            )
            .first()
        )
        if not labour:
            raise HTTPException(400, "Choose a labour product")
        cleaned.append(
            {
                "labour_product_id": labour_id,
                "quantity": format(qty.quantize(Decimal("0.001")), "f"),
                "labour_name": labour.name,
            }
        )
    return cleaned or None


def _product_out(row: PracticeProduct) -> ProductOut:
    data = ProductOut.model_validate(row)
    data.uses_default_markup = row.markup_percent is None
    data.linked_labour = _public_links(row.linked_labour)
    return data


def _get_item(db: Session, profile_id: int, item_id: int) -> PracticeProduct:
    row = (
        db.query(PracticeProduct)
        .filter(PracticeProduct.id == item_id, PracticeProduct.user_profile_id == profile_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Product not found")
    return row


def _list_products(
    include_archived: bool,
    q: str | None,
    limit: int,
    family: str | None,
    db: Session,
    profile_id: int,
):
    query = db.query(PracticeProduct).filter(PracticeProduct.user_profile_id == profile_id)
    if family:
        query = query.filter(PracticeProduct.family == _family(family))
    if not include_archived:
        query = query.filter(PracticeProduct.is_archived.is_(False))
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(
            or_(
                PracticeProduct.name.ilike(like),
                PracticeProduct.category.ilike(like),
                PracticeProduct.description.ilike(like),
                PracticeProduct.supplier_stock_code.ilike(like),
                PracticeProduct.supplier_code.ilike(like),
                PracticeProduct.stock_code.ilike(like),
            )
        )
    rows = query.order_by(PracticeProduct.name.asc()).limit(limit).all()
    return [_product_out(r) for r in rows]


@router.get("/products", response_model=list[ProductOut])
def list_products(
    include_archived: bool = False,
    q: str | None = Query(default=None),
    family: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _list_products(include_archived, q, limit, family, db, profile_id)


@router.get("/stock", response_model=list[ProductOut], include_in_schema=False)
def list_stock_alias(
    include_archived: bool = False,
    q: str | None = Query(default=None),
    family: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _list_products(include_archived, q, limit, family, db, profile_id)


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    family = _family(body.family) or "quantitative"
    cost = _money(body.cost_price)
    retail = _money(body.retail_price)
    markup = _percent(body.markup_percent)
    default = _family_default(db, profile_id, family)
    if markup is not None and cost > 0:
        retail = _retail_from(cost, markup)
    elif markup is None and default is not None and cost > 0:
        retail = _retail_from(cost, default)
    row = PracticeProduct(
        user_profile_id=profile_id,
        name=body.name.strip(),
        family=family,
        category=_canonical_category(db, profile_id, body.category),
        description=_blank(body.description),
        supplier_stock_code=_blank(body.supplier_stock_code),
        supplier_code=_blank(body.supplier_code),
        stock_code=_blank(body.stock_code),
        max_length_mm=_mm(body.max_length_mm),
        max_width_mm=_mm(body.max_width_mm),
        thickness_mm=_mm(body.thickness_mm),
        cut_and_edge=bool(body.cut_and_edge),
        price_basis=_price_basis(family, body.price_basis),
        linked_labour=_clean_links(db, profile_id, family, body.linked_labour),
        cost_price=cost,
        markup_percent=markup,
        retail_price=retail,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _product_out(row)


@router.get("/products/categories", response_model=list[str])
def list_product_categories(
    family: str | None = Query(default=None),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    query = db.query(PracticeProduct.category).filter(
        PracticeProduct.user_profile_id == profile_id,
        PracticeProduct.is_archived.is_(False),
        PracticeProduct.category.isnot(None),
        PracticeProduct.category != "",
    )
    if family:
        query = query.filter(PracticeProduct.family == _family(family))
    rows = query.all()
    seen: dict[str, str] = {}
    for (raw,) in rows:
        name = (raw or "").strip()
        if not name:
            continue
        key = name.lower()
        if key not in seen:
            seen[key] = name
    return sorted(seen.values(), key=str.lower)


@router.get("/products/markup-defaults", response_model=ProductMarkupDefaultsOut)
def get_markup_defaults(
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _defaults_out(db, profile_id)


@router.put("/products/markup-defaults", response_model=ProductMarkupDefaultsOut)
def update_markup_default(
    body: ProductMarkupDefaultUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    family = _family(body.family) or "quantitative"
    markup = _percent(body.markup_percent)
    settings = get_or_create_settings(db, profile_id)
    current = dict(_stored_defaults(db, profile_id))
    if markup is None:
        current.pop(family, None)
    else:
        current[family] = format(markup, "f")
    settings.product_markup_defaults = current
    flag_modified(settings, "product_markup_defaults")
    _reprice_default_users(db, profile_id, family, markup)
    db.commit()
    return _defaults_out(db, profile_id)


@router.get("/products/{item_id}", response_model=ProductOut)
def get_product(
    item_id: int,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _product_out(_get_item(db, profile_id, item_id))


@router.patch("/products/{item_id}", response_model=ProductOut)
def update_product(
    item_id: int,
    body: ProductUpdate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    row = _get_item(db, profile_id, item_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
        if not row.name:
            raise HTTPException(400, "Product name is required")
    if "family" in data and data["family"] is not None:
        row.family = _family(data["family"])
    if "category" in data:
        row.category = _canonical_category(db, profile_id, data["category"])
    if "description" in data:
        row.description = _blank(data["description"])
    if "supplier_stock_code" in data:
        row.supplier_stock_code = _blank(data["supplier_stock_code"])
    if "supplier_code" in data:
        row.supplier_code = _blank(data["supplier_code"])
    if "stock_code" in data:
        row.stock_code = _blank(data["stock_code"])
    if "max_length_mm" in data:
        row.max_length_mm = _mm(data["max_length_mm"])
    if "max_width_mm" in data:
        row.max_width_mm = _mm(data["max_width_mm"])
    if "thickness_mm" in data:
        row.thickness_mm = _mm(data["thickness_mm"])
    if "cut_and_edge" in data and data["cut_and_edge"] is not None:
        row.cut_and_edge = bool(data["cut_and_edge"])
    if "price_basis" in data or "family" in data:
        row.price_basis = _price_basis(row.family, data.get("price_basis", row.price_basis))
    if "linked_labour" in data or "family" in data:
        row.linked_labour = _clean_links(
            db, profile_id, row.family, data.get("linked_labour", row.linked_labour)
        )
        flag_modified(row, "linked_labour")
    if "cost_price" in data and data["cost_price"] is not None:
        row.cost_price = _money(data["cost_price"])
    if "markup_percent" in data:
        row.markup_percent = _percent(data["markup_percent"])
        cost = _money(row.cost_price)
        default = _family_default(db, profile_id, row.family)
        if row.markup_percent is not None and cost > 0:
            row.retail_price = _retail_from(cost, row.markup_percent)
        elif row.markup_percent is None and default is not None and cost > 0:
            row.retail_price = _retail_from(cost, default)
        elif "retail_price" in data and data["retail_price"] is not None:
            row.retail_price = _money(data["retail_price"])
    elif "retail_price" in data and data["retail_price"] is not None:
        row.retail_price = _money(data["retail_price"])
        row.markup_percent = _markup_from_prices(_money(row.cost_price), row.retail_price)
    elif "cost_price" in data and row.markup_percent is not None and _money(row.cost_price) > 0:
        row.retail_price = _retail_from(_money(row.cost_price), row.markup_percent)
    elif "cost_price" in data and row.markup_percent is None:
        default = _family_default(db, profile_id, row.family)
        if default is not None and _money(row.cost_price) > 0:
            row.retail_price = _retail_from(_money(row.cost_price), default)
    if "is_archived" in data and data["is_archived"] is not None:
        row.is_archived = bool(data["is_archived"])
    db.commit()
    db.refresh(row)
    return _product_out(row)
