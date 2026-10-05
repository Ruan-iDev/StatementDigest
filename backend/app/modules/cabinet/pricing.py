"""Jobcard pricing. The basket stores every piece. The price is worked out here.

Cut and edge boards are charged by how many sheets they occupy. Square metre
and linear products of the same catalogue item are added into one measured line.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.modules.cabinet.sheets import piece_count, sheet_count

SHEET_HOSTS = ("timber", "square_meter", "quantitative")
MAX_PIECES = 2000


class PriceError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass
class CatalogProduct:
    id: int
    name: str
    family: str
    price_basis: str | None
    cut_and_edge: bool
    max_length_mm: Decimal | None
    max_width_mm: Decimal | None
    retail_price: Decimal
    archived: bool = False


@dataclass
class PriceLine:
    product_id: int
    quantity: Decimal
    length_mm: Decimal | None = None
    width_mm: Decimal | None = None
    source_product_id: int | None = None
    detail: str | None = None
    unit_price: Decimal | None = None
    name: str | None = None
    family: str | None = None


@dataclass
class PriceRow:
    product_id: int | None
    name: str
    family: str
    detail: str
    quantity: Decimal
    unit_label: str
    unit_price: Decimal
    line_ex_vat: Decimal
    vat_amount: Decimal
    line_total: Decimal


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


def _text(value: Decimal, places: str = "0.01") -> str:
    text = f"{Decimal(value).quantize(Decimal(places)):f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _money(measure: Decimal, unit: Decimal, vat_on: bool, vat_rate: Decimal):
    ex = (measure * unit).quantize(Decimal("0.01"))
    vat = (ex * vat_rate / Decimal(100)).quantize(Decimal("0.01")) if vat_on else Decimal("0.00")
    return ex, vat, (ex + vat).quantize(Decimal("0.01"))


def _row(
    product_id: int | None,
    name: str,
    family: str,
    detail: str,
    quantity: Decimal,
    unit_label: str,
    unit_price: Decimal,
    vat_on: bool,
    vat_rate: Decimal,
) -> PriceRow:
    ex, vat, total = _money(quantity, unit_price, vat_on, vat_rate)
    return PriceRow(
        product_id=product_id,
        name=name,
        family=family,
        detail=detail,
        quantity=quantity,
        unit_label=unit_label,
        unit_price=unit_price,
        line_ex_vat=ex,
        vat_amount=vat,
        line_total=total,
    )


def _positive(line: PriceLine, strict: bool) -> bool:
    if line.quantity > 0:
        return True
    if strict:
        raise PriceError("Quantity must be greater than zero")
    return False


def _sheet_pieces(name: str, group: list[PriceLine], strict: bool) -> list[tuple[Decimal, Decimal]]:
    pieces: list[tuple[Decimal, Decimal]] = []
    for line in group:
        if not _positive(line, strict):
            continue
        length = line.length_mm
        width = line.width_mm
        if length is None or width is None or length <= 0 or width <= 0:
            raise PriceError(f"{name} is Cut and Edge and needs a length and a width")
        pieces.extend((length, width) for _ in range(piece_count(line.quantity)))
    if len(pieces) > MAX_PIECES:
        raise PriceError("That is too many pieces to place on sheets at once")
    return pieces


def _has_sheet(product: CatalogProduct) -> bool:
    length = product.max_length_mm
    width = product.max_width_mm
    return length is not None and width is not None and length > 0 and width > 0


def _area(name: str, group: list[PriceLine], strict: bool) -> Decimal:
    total = Decimal("0")
    for line in group:
        if not _positive(line, strict):
            continue
        length = line.length_mm
        width = line.width_mm
        if length is None or width is None or length <= 0 or width <= 0:
            raise PriceError(f"{name} is priced per square metre and needs a length and a width")
        total += line.quantity * (length / Decimal(1000)) * (width / Decimal(1000))
    return total.quantize(Decimal("0.001"))


def _metres(name: str, group: list[PriceLine], strict: bool) -> Decimal:
    total = Decimal("0")
    for line in group:
        if not _positive(line, strict):
            continue
        length = line.length_mm
        if length is None or length <= 0:
            raise PriceError(f"{name} is priced per metre and needs a length")
        total += line.quantity * (length / Decimal(1000))
    return total.quantize(Decimal("0.001"))


def _count(group: list[PriceLine], strict: bool) -> Decimal:
    total = Decimal("0")
    for line in group:
        if not _positive(line, strict):
            continue
        total += line.quantity
    return total.quantize(Decimal("0.001"))


def _material_row(
    product: CatalogProduct | None,
    group: list[PriceLine],
    vat_on: bool,
    vat_rate: Decimal,
    strict: bool,
) -> PriceRow | None:
    sample = group[0]
    if product is None:
        quantity = _count(group, strict)
        if quantity <= 0:
            return None
        unit = (sample.unit_price if sample.unit_price is not None else Decimal("0")).quantize(Decimal("0.01"))
        return _row(
            sample.product_id,
            sample.name or "Item",
            sample.family or "quantitative",
            "",
            quantity,
            "qty",
            unit,
            vat_on,
            vat_rate,
        )

    family = product.family or "quantitative"
    basis = _basis(family, product.price_basis)
    unit = Decimal(product.retail_price).quantize(Decimal("0.01"))
    name = product.name
    if family in SHEET_HOSTS and product.cut_and_edge:
        pieces = _sheet_pieces(name, group, strict)
        if not pieces:
            return None
        sheets = sheet_count(product.max_length_mm, product.max_width_mm, pieces)
        if basis == "square_meter" and _has_sheet(product):
            length = Decimal(product.max_length_mm or 0)
            width = Decimal(product.max_width_mm or 0)
            sheet_area = (length / Decimal(1000)) * (width / Decimal(1000))
            sheet_value = (sheet_area * unit).quantize(Decimal("0.01"))
            detail = (
                f"{_text(length)} × {_text(width)} mm sheet"
                f" · {_text(sheet_area, '0.001')} m² × the m² rate"
            )
            return _row(product.id, name, family, detail, Decimal(sheets), "sheets", sheet_value, vat_on, vat_rate)
        if basis == "square_meter":
            area = _area(name, group, strict)
            return _row(
                product.id,
                name,
                family,
                "No sheet size, so this is the cut area",
                area,
                "m²",
                unit,
                vat_on,
                vat_rate,
            )
        if _has_sheet(product):
            length = Decimal(product.max_length_mm or 0)
            width = Decimal(product.max_width_mm or 0)
            detail = f"{_text(length)} × {_text(width)} mm sheet"
        else:
            detail = "Each piece is its own sheet until a max length and max width are set"
        return _row(product.id, name, family, detail, Decimal(sheets), "sheets", unit, vat_on, vat_rate)

    together = "Added together" if sum(1 for line in group if line.quantity > 0) > 1 else ""
    if basis == "square_meter":
        area = _area(name, group, strict)
        if area <= 0:
            return None
        return _row(product.id, name, family, together, area, "m²", unit, vat_on, vat_rate)
    if basis == "meter":
        metres = _metres(name, group, strict)
        if metres <= 0:
            return None
        return _row(product.id, name, family, together, metres, "m", unit, vat_on, vat_rate)
    quantity = _count(group, strict)
    if quantity <= 0:
        return None
    return _row(product.id, name, family, together, quantity, "qty", unit, vat_on, vat_rate)


def _labour_row(
    line: PriceLine,
    product: CatalogProduct | None,
    vat_on: bool,
    vat_rate: Decimal,
    strict: bool,
) -> PriceRow | None:
    if not _positive(line, strict):
        return None
    if product is None:
        unit = (line.unit_price if line.unit_price is not None else Decimal("0")).quantize(Decimal("0.01"))
        name = line.name or "Labour"
        family = line.family or "labour"
    else:
        unit = Decimal(product.retail_price).quantize(Decimal("0.01"))
        name = product.name
        family = product.family or "labour"
    quantity = Decimal(line.quantity).quantize(Decimal("0.001"))
    return _row(line.product_id, name, family, (line.detail or "").strip(), quantity, "qty", unit, vat_on, vat_rate)


def price_lines(
    lines: list[PriceLine],
    products: dict[int, CatalogProduct],
    vat_on: bool,
    vat_rate: Decimal,
    strict: bool = True,
) -> tuple[list[PriceRow], Decimal, Decimal, Decimal]:
    grouped: list[tuple[int, list[PriceLine]]] = []
    seen: dict[int, int] = {}
    labour: list[PriceLine] = []
    for line in lines:
        if line.source_product_id is not None:
            labour.append(line)
            continue
        slot = seen.get(line.product_id)
        if slot is None:
            seen[line.product_id] = len(grouped)
            grouped.append((line.product_id, [line]))
        else:
            grouped[slot][1].append(line)

    rows: list[PriceRow] = []
    for product_id, group in grouped:
        product = products.get(product_id)
        if product is None or product.archived:
            if strict:
                raise PriceError("Product not found")
            product = None
        row = _material_row(product, group, vat_on, vat_rate, strict)
        if row is not None:
            rows.append(row)
    for line in labour:
        product = products.get(line.product_id)
        if product is None or product.archived:
            if strict:
                raise PriceError("Product not found")
            product = None
        row = _labour_row(line, product, vat_on, vat_rate, strict)
        if row is not None:
            rows.append(row)

    ex = sum((row.line_ex_vat for row in rows), Decimal("0.00"))
    vat = sum((row.vat_amount for row in rows), Decimal("0.00"))
    return rows, ex.quantize(Decimal("0.01")), vat.quantize(Decimal("0.01")), (ex + vat).quantize(Decimal("0.01"))
