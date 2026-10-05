"""How many sheets a set of cut pieces occupies.

Straight placement on the product's max length and max width. Pieces keep the
orientation that was entered. Blade kerf and board trim are not applied.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP


def _units(value: Decimal | None) -> int | None:
    if value is None:
        return None
    return int((Decimal(value) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def piece_count(quantity: Decimal) -> int:
    if quantity <= 0:
        return 0
    return int(Decimal(quantity).to_integral_value(rounding=ROUND_CEILING))


def sheet_count(
    sheet_length: Decimal | None,
    sheet_width: Decimal | None,
    pieces: list[tuple[Decimal, Decimal]],
) -> int:
    """Return how many sheets the pieces need. Each piece is one rectangle.

    A blank sheet side cannot be shared, so each piece counts as its own sheet.
    """
    rects: list[tuple[int, int]] = []
    for length, width in pieces:
        x = _units(length) or 0
        y = _units(width) or 0
        if x > 0 and y > 0:
            rects.append((x, y))
    if not rects:
        return 0
    sheet_x = _units(sheet_length)
    sheet_y = _units(sheet_width)
    if sheet_x is None or sheet_y is None or sheet_x <= 0 or sheet_y <= 0:
        return len(rects)

    rects.sort(key=lambda rect: rect[0] * rect[1], reverse=True)
    sheets: list[list[tuple[int, int, int, int]]] = []
    for piece_x, piece_y in rects:
        if piece_x > sheet_x or piece_y > sheet_y:
            sheets.append([])
            continue
        placed = False
        for free in sheets:
            best_at: int | None = None
            best_key: tuple[int, int] | None = None
            for index, (x, y, width, height) in enumerate(free):
                if piece_x <= width and piece_y <= height:
                    key = (y, x)
                    if best_key is None or key < best_key:
                        best_key = key
                        best_at = index
            if best_at is None:
                continue
            x, y, width, height = free.pop(best_at)
            if width - piece_x > 0:
                free.append((x + piece_x, y, width - piece_x, piece_y))
            if height - piece_y > 0:
                free.append((x, y + piece_y, width, height - piece_y))
            placed = True
            break
        if placed:
            continue
        free = []
        if sheet_x - piece_x > 0:
            free.append((piece_x, 0, sheet_x - piece_x, piece_y))
        if sheet_y - piece_y > 0:
            free.append((0, piece_y, sheet_x, sheet_y - piece_y))
        sheets.append(free)
    return len(sheets)
