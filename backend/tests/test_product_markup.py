"""Product catalogue markup: cost + % → retail, or cost + retail → %."""

from decimal import Decimal

from app.modules.practice.products import _markup_from_prices, _retail_from


def test_retail_from_cost_and_markup():
    assert _retail_from(Decimal("100.00"), Decimal("50")) == Decimal("150.00")
    assert _retail_from(Decimal("80.00"), Decimal("25")) == Decimal("100.00")
    assert _retail_from(Decimal("40.00"), Decimal("12.5")) == Decimal("45.00")


def test_markup_from_cost_and_retail():
    assert _markup_from_prices(Decimal("100.00"), Decimal("150.00")) == Decimal("50.00")
    assert _markup_from_prices(Decimal("80.00"), Decimal("100.00")) == Decimal("25.00")
    assert _markup_from_prices(Decimal("0"), Decimal("10.00")) is None
    assert _markup_from_prices(Decimal("100.00"), Decimal("0")) is None
