from copy import deepcopy
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

from app.Domains.Replenishment.resources.calculation import RecommendationDetails
from app.Domains.Replenishment.services.engine import calculate

AS_OF = date(2026, 5, 31)
PRODUCT, SUPPLIER, CATEGORY = str(uuid4()), str(uuid4()), str(uuid4())


def snapshot(days=120, quantity=10):
    return {
        "products": [
            {
                "id": PRODUCT,
                "sku": "CABLE-01",
                "name": "Кабель",
                "category_id": CATEGORY,
                "supplier_id": SUPPLIER,
                "unit": "м",
                "lead_time_days": 14,
                "review_days": 7,
                "safety_days": 7,
                "pack_size": "1",
                "min_order_qty": "0",
                "active": True,
            }
        ],
        "sales": [
            {
                "product_id": PRODUCT,
                "date": (AS_OF - timedelta(days=offset)).isoformat(),
                "quantity": str(quantity),
                "client_id": "anon-1",
            }
            for offset in range(days)
        ],
        "stocks": [
            {"product_id": PRODUCT, "as_of": AS_OF.isoformat(), "quantity": "0", "reserved": "0"}
        ],
        "stockouts": [],
        "inbound": [],
        "growth": [],
        "source_versions": [],
        "warnings": [],
    }


def quantity(data, as_of=AS_OF):
    return Decimal(calculate(data, as_of)[0]["recommended_quantity"])


def test_baseline_and_each_input_changes_result():
    data = snapshot()
    assert quantity(data) == 280
    sales = deepcopy(data)
    for row in sales["sales"]:
        row["quantity"] = "12"
    assert quantity(sales) > quantity(data)
    stocks = deepcopy(data)
    stocks["stocks"][0]["quantity"] = "20"
    assert quantity(stocks) == 260
    stocks["stocks"][0]["reserved"] = "5"
    assert quantity(stocks) == 265
    inbound = deepcopy(data)
    inbound["inbound"] = [
        {
            "product_id": PRODUCT,
            "expected_date": "2026-06-01",
            "quantity": "40",
            "status": "confirmed",
        }
    ]
    assert quantity(inbound) == 240
    category_policy = deepcopy(data)
    category_policy["products"][0]["review_days"] = 14
    assert quantity(category_policy) == 350
    growth = deepcopy(data)
    growth["growth"] = [
        {
            "category_id": CATEGORY,
            "product_id": None,
            "start": "2026-06-01",
            "end": "2026-07-01",
            "rate": "0.2",
            "mode": "additional",
        }
    ]
    assert quantity(growth) == 336


def test_partner_missing_conditions_block_even_with_valid_numeric_inputs():
    data = snapshot()
    data["products"][0]["data_quality"] = {
        "origin": "partner_workbook",
        "status": "blocked",
        "reasons": ["unconfirmed_purchase_unit"],
    }
    result = calculate(data, AS_OF)[0]
    assert result["status"] == "blocked"
    assert "unconfirmed_purchase_unit" in result["details"]["warnings"]


def test_partner_historical_stock_cannot_authorize_order():
    data = snapshot()
    data["products"][0]["data_quality"] = {"origin": "partner_workbook", "status": "limited"}
    data["stocks"][0]["as_of"] = (AS_OF - timedelta(days=30)).isoformat()
    result = calculate(data, AS_OF)[0]
    assert result["status"] == "blocked"
    assert "stale_partner_stock_snapshot" in result["details"]["warnings"]


def test_partner_coverage_ignores_old_isolated_return():
    data = snapshot()
    data["products"][0]["data_quality"] = {"history_start": "2026-02-01"}
    before = calculate(data, AS_OF)[0]
    data["sales"].append({"product_id": PRODUCT, "date": "2025-01-01", "quantity": "-50"})
    after = calculate(data, AS_OF)[0]
    assert after["recommended_quantity"] == before["recommended_quantity"]
    assert after["details"]["history"] == before["details"]["history"]


def test_stockout_compensation_is_above_raw_forecast():
    data = snapshot()
    data["sales"] = [row for row in data["sales"] if row["date"] < "2026-05-18"]
    data["stockouts"] = [{"product_id": PRODUCT, "start": "2026-05-18", "end": None}]
    corrected = calculate(data, AS_OF)[0]
    raw = deepcopy(data)
    raw["stockouts"] = []
    assert quantity(data) > quantity(raw)
    assert Decimal(corrected["details"]["breakdown"]["lost_demand"]) == 140
    assert quantity(data) == 280


def test_customer_day_spike_is_excluded_but_recurring_bulk_is_kept():
    data = snapshot()
    baseline = quantity(data)
    for _ in range(10):
        data["sales"].append(
            {
                "product_id": PRODUCT,
                "date": AS_OF.isoformat(),
                "quantity": "1000",
                "client_id": "anon-large",
            }
        )
    result = calculate(data, AS_OF)[0]
    assert quantity(data) == baseline
    assert len(result["details"]["excluded_sales"]) == 1
    assert Decimal(result["details"]["breakdown"]["excluded_quantity"]) == 10000
    recurring = snapshot()
    for offset in (0, 28, 56):
        recurring["sales"].append(
            {
                "product_id": PRODUCT,
                "date": (AS_OF - timedelta(days=offset)).isoformat(),
                "quantity": "100",
                "client_id": "anon-recurring",
            }
        )
    assert calculate(recurring, AS_OF)[0]["details"]["excluded_sales"] == []
    assert quantity(recurring) > baseline


def test_seasonality_forecasts_upcoming_summer_and_category_fallback():
    data = snapshot(730)
    for row in data["sales"]:
        row["quantity"] = "30" if date.fromisoformat(row["date"]).month in (6, 7, 8) else "10"
    result = calculate(data, AS_OF)[0]
    assert Decimal(result["details"]["forecast"][0]["quantity"]) > 25
    assert result["details"]["breakdown"]["seasonality_method"] == "product_monthly"
    new_product = str(uuid4())
    data["products"].append({**data["products"][0], "id": new_product, "sku": "NEW"})
    data["stocks"].append({**data["stocks"][0], "product_id": new_product})
    data["sales"].extend([{**row, "product_id": new_product} for row in snapshot(56)["sales"]])
    result = calculate(data, AS_OF)[1]
    assert result["details"]["breakdown"]["seasonality_method"] == "category_monthly"
    assert Decimal(result["details"]["forecast"][0]["quantity"]) > 25


def test_sustained_growth_and_replace_trend_do_not_double_count():
    data = snapshot()
    for row in data["sales"]:
        offset = (AS_OF - date.fromisoformat(row["date"])).days
        row["quantity"] = str(20 - offset / 12)
    original = calculate(data, AS_OF)[0]
    assert Decimal(original["details"]["breakdown"]["trend_daily_slope"]) > 0
    assert Decimal(original["details"]["forecast"][-1]["quantity"]) > Decimal(
        original["details"]["forecast"][0]["quantity"]
    )
    data["growth"] = [
        {
            "product_id": PRODUCT,
            "start": "2026-06-01",
            "end": "2026-07-01",
            "rate": "0.1",
            "mode": "additional",
        }
    ]
    additional = quantity(data)
    data["growth"][0]["mode"] = "replace_trend"
    assert quantity(data) < additional
    assert all(
        row["trend_increment"] == "0.000000"
        for row in calculate(data, AS_OF)[0]["details"]["forecast"]
    )


def test_future_sales_stocks_and_outages_do_not_leak_into_forecast():
    data = snapshot()
    expected = calculate(data, AS_OF)
    data["sales"].append(
        {"product_id": PRODUCT, "date": "2027-01-01", "quantity": "999999", "client_id": "future"}
    )
    data["stocks"].append({"product_id": PRODUCT, "as_of": "2027-01-01", "quantity": "1000"})
    data["stockouts"].append({"product_id": PRODUCT, "start": "2027-01-01", "end": None})
    assert calculate(data, AS_OF) == expected


def test_late_inbound_lowers_quantity_but_preserves_shortage_risk():
    data = snapshot()
    data["inbound"] = [
        {
            "product_id": PRODUCT,
            "expected_date": "2026-06-20",
            "quantity": "280",
            "status": "in_transit",
        }
    ]
    result = calculate(data, AS_OF)[0]
    assert Decimal(result["recommended_quantity"]) == 0
    assert result["urgency"] == "critical"
    assert result["details"]["breakdown"]["shortage_date"] == "2026-06-01"
    data["inbound"][0]["expected_date"] = "2026-07-01"
    assert quantity(data) == 280
    data["inbound"][0]["expected_date"] = "2026-05-30"
    assert quantity(data) == 280
    assert "overdue_inbound_excluded" in calculate(data, AS_OF)[0]["details"]["warnings"]


def test_formula_is_exact_and_details_match_swagger_schema():
    data = snapshot(quantity=0.13)
    data["products"][0].update(pack_size="0.25", min_order_qty="4.1")
    result = calculate(data, AS_OF)[0]
    details = RecommendationDetails.model_validate(result["details"])
    breakdown = details.breakdown
    assert Decimal(result["recommended_quantity"]) == Decimal("4.25")
    assert (
        breakdown.recommended_quantity
        == breakdown.unrounded_quantity + breakdown.rounding_increment
    )
    assert breakdown.unrounded_quantity == max(
        0,
        breakdown.forecast_quantity
        + breakdown.safety_stock
        - breakdown.available_stock
        - breakdown.inbound_quantity,
    )


def test_zero_demand_missing_inputs_and_stockout_without_reference():
    data = snapshot(quantity=0)
    assert quantity(data) == 0
    data["products"][0]["supplier_id"] = None
    result = calculate(data, AS_OF)[0]
    assert result["status"] == "blocked"
    assert "missing_supplier" in result["details"]["warnings"]
    data = snapshot()
    data["sales"] = []
    data["stockouts"] = [{"product_id": PRODUCT, "start": "2026-05-01", "end": None}]
    assert "stockout_without_reference" in calculate(data, AS_OF)[0]["details"]["warnings"]


def test_product_growth_overrides_category_and_incomplete_sync_blocks():
    data = snapshot()
    data["growth"] = [
        {
            "category_id": CATEGORY,
            "start": "2026-06-01",
            "end": "2026-07-01",
            "rate": "0.5",
            "mode": "additional",
        },
        {
            "product_id": PRODUCT,
            "start": "2026-06-01",
            "end": "2026-07-01",
            "rate": "0.1",
            "mode": "additional",
        },
    ]
    assert quantity(data) == 308
    data["source_versions"] = [{"complete": False}]
    assert calculate(data, AS_OF)[0]["status"] == "blocked"


def test_missing_clients_are_not_invented_and_day_outliers_remain_auditable():
    data = snapshot()
    for row in data["sales"]:
        row["client_id"] = None
    data["sales"][0]["quantity"] = "10000"
    result = calculate(data, AS_OF)[0]
    assert "missing_client_ids_day_level_outliers_only" in result["details"]["warnings"]
    excluded = result["details"]["excluded_sales"]
    assert len(excluded) == 1
    assert excluded[0]["client_id"] is None
    assert excluded[0]["reason"] == "one_off_day_no_client"
    assert Decimal(result["recommended_quantity"]) < 300


def test_fractional_formula_remains_exact_after_serialization():
    data = snapshot(quantity="0.123457")
    data["products"][0]["pack_size"] = "0.000001"
    data["growth"] = [
        {
            "product_id": PRODUCT,
            "start": "2026-06-01",
            "end": "2026-06-02",
            "rate": "0.123456",
            "mode": "additional",
        }
    ]
    detail = RecommendationDetails.model_validate(calculate(data, AS_OF)[0]["details"])
    values = detail.breakdown
    assert values.unrounded_quantity == values.forecast_quantity + values.safety_stock
    assert values.recommended_quantity == values.unrounded_quantity + values.rounding_increment
