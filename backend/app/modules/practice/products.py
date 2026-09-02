"""Product library — reusable quote/invoice lines (goods, labour, and other items)."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_active_profile_id
from app.modules.practice.models import PracticeProduct
from app.modules.practice.schemas import ProductCreate, ProductOut, ProductUpdate
from app.services.money import to_decimal

router = APIRouter()


def _money(value) -> Decimal:
    n = to_decimal(value)
    if n < 0:
        raise HTTPException(400, "Prices cannot be negative")
    return n.quantize(Decimal("0.01"))


def _blank(value: str | None) -> str | None:
    raw = (value or "").strip()
    return raw or None


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


def _product_out(row: PracticeProduct) -> ProductOut:
    data = ProductOut.model_validate(row)
    if data.markup_percent is None:
        data.markup_percent = _markup_from_prices(_money(row.cost_price), _money(row.retail_price))
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
    db: Session,
    profile_id: int,
):
    query = db.query(PracticeProduct).filter(PracticeProduct.user_profile_id == profile_id)
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
            )
        )
    rows = query.order_by(PracticeProduct.name.asc()).limit(limit).all()
    return [_product_out(r) for r in rows]


@router.get("/products", response_model=list[ProductOut])
def list_products(
    include_archived: bool = False,
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _list_products(include_archived, q, limit, db, profile_id)


@router.get("/stock", response_model=list[ProductOut], include_in_schema=False)
def list_stock_alias(
    include_archived: bool = False,
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    return _list_products(include_archived, q, limit, db, profile_id)


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    body: ProductCreate,
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    cost = _money(body.cost_price)
    retail = _money(body.retail_price)
    markup = _percent(body.markup_percent)
    if markup is not None and cost > 0 and retail == 0:
        retail = _retail_from(cost, markup)
    if markup is None:
        markup = _markup_from_prices(cost, retail)
    row = PracticeProduct(
        user_profile_id=profile_id,
        name=body.name.strip(),
        category=_canonical_category(db, profile_id, body.category),
        description=_blank(body.description),
        supplier_stock_code=_blank(body.supplier_stock_code),
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
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_active_profile_id),
):
    rows = (
        db.query(PracticeProduct.category)
        .filter(
            PracticeProduct.user_profile_id == profile_id,
            PracticeProduct.is_archived.is_(False),
            PracticeProduct.category.isnot(None),
            PracticeProduct.category != "",
        )
        .all()
    )
    seen: dict[str, str] = {}
    for (raw,) in rows:
        name = (raw or "").strip()
        if not name:
            continue
        key = name.lower()
        if key not in seen:
            seen[key] = name
    return sorted(seen.values(), key=str.lower)


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
    if "category" in data:
        row.category = _canonical_category(db, profile_id, data["category"])
    if "description" in data:
        row.description = _blank(data["description"])
    if "supplier_stock_code" in data:
        row.supplier_stock_code = _blank(data["supplier_stock_code"])
    if "cost_price" in data and data["cost_price"] is not None:
        row.cost_price = _money(data["cost_price"])
    if "retail_price" in data and data["retail_price"] is not None:
        row.retail_price = _money(data["retail_price"])
    if "markup_percent" in data:
        row.markup_percent = _percent(data["markup_percent"])
    elif "cost_price" in data or "retail_price" in data:
        row.markup_percent = _markup_from_prices(_money(row.cost_price), _money(row.retail_price))
    if "is_archived" in data and data["is_archived"] is not None:
        row.is_archived = bool(data["is_archived"])
    db.commit()
    db.refresh(row)
    return _product_out(row)
