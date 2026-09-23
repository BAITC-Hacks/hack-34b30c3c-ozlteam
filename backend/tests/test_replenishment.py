from copy import deepcopy
from datetime import timedelta
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from openpyxl import load_workbook
from pydantic import ValidationError

from app.Domains.Replenishment.adapters.xlsx import create_workbook, parse_workbook
from app.Domains.Replenishment.controllers.http import router
from app.Domains.Replenishment.DTO.calculation import CalculationInput
from app.Domains.Replenishment.services.calculation import calculate
from app.Domains.Replenishment.services.demo import demo_input
from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import Permission, User


@pytest.fixture
def preview_app():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: User(
        id=uuid4(),
        first_name="Закупщик",
        roles=[],
        permissions=[
            Permission(code="replenishment.read", name="Чтение"),
            Permission(code="replenishment.run", name="Расчёт"),
        ],
    )
    return app


def _line(result, sku):
    return next(row for row in result.recommendations if row.sku == sku)


def test_recommendations_use_stock_inbound_category_growth_and_lead_time():
    original = demo_input()
    baseline = calculate(original)
    assert len(baseline.recommendations) == 3
    assert {row.supplier_id for row in baseline.recommendations} == {"S-01", "S-02"}
    assert all(row.recommended_qty > 0 and row.explanation for row in baseline.recommendations)

    more_stock = deepcopy(original)
    more_stock.stock[0].quantity += 20
    assert _line(calculate(more_stock), "EK-CABLE-25").recommended_qty == (
        _line(baseline, "EK-CABLE-25").recommended_qty - 20
    )
    more_inbound = deepcopy(original)
    more_inbound.inbound[0].quantity += 20
    assert _line(calculate(more_inbound), "EK-CABLE-25").recommended_qty == (
        _line(baseline, "EK-CABLE-25").recommended_qty - 20
    )
    more_growth = deepcopy(original)
    more_growth.category_growth[0].growth_pct += 0.10
    assert _line(calculate(more_growth), "EK-CABLE-25").recommended_qty > (
        _line(baseline, "EK-CABLE-25").recommended_qty
    )
    longer_lead = deepcopy(original)
    longer_lead.suppliers[0].lead_days += 7
    assert _line(calculate(longer_lead), "EK-CABLE-25").recommended_qty > (
        _line(baseline, "EK-CABLE-25").recommended_qty
    )


def test_seasonality_and_sustained_trend_have_distinct_effects():
    data = demo_input()
    baseline = calculate(data)
    cable = _line(baseline, "EK-CABLE-25")
    switch = _line(baseline, "EK-SWITCH-16")
    assert cable.metrics.seasonality_factor > 1.2
    assert switch.metrics.trend_factor > 1.1
    assert switch.metrics.seasonality_factor == 1.0

    flat_season = deepcopy(data)
    for sale in flat_season.sales:
        if sale.sku == "EK-CABLE-25" and sale.date.year == 2025 and sale.date.month == 9:
            sale.quantity = 4
    assert _line(calculate(flat_season), "EK-CABLE-25").recommended_qty < cable.recommended_qty

    flat_trend = deepcopy(data)
    for sale in flat_trend.sales:
        if sale.sku == "EK-SWITCH-16" and sale.customer_id != "anon-bulk-742":
            sale.quantity = 2
    assert _line(calculate(flat_trend), "EK-SWITCH-16").recommended_qty < switch.recommended_qty


def test_stockout_compensates_lost_demand():
    data = demo_input()
    with_stockout = _line(calculate(data), "EK-LAMP-12")
    without = deepcopy(data)
    without.stockouts.clear()
    without_stockout = _line(calculate(without), "EK-LAMP-12")
    assert with_stockout.metrics.lost_demand_units == 30
    assert without_stockout.metrics.lost_demand_units == 0
    assert with_stockout.recommended_qty > without_stockout.recommended_qty


def test_isolated_customer_spike_does_not_inflate_regular_order():
    data = demo_input()
    with_spike = _line(calculate(data), "EK-SWITCH-16")
    without = deepcopy(data)
    without.sales = [row for row in without.sales if row.customer_id != "anon-bulk-742"]
    without_spike = _line(calculate(without), "EK-SWITCH-16")
    assert with_spike.metrics.raw_sales == without_spike.metrics.raw_sales + 240
    assert with_spike.metrics.excluded_spike_units == 240
    assert with_spike.recommended_qty == without_spike.recommended_qty


def test_xlsx_roundtrip_and_derived_config():
    data = demo_input()
    restored = parse_workbook(create_workbook(data))
    assert restored == data
    assert calculate(restored) == calculate(data)

    workbook = load_workbook(BytesIO(create_workbook(data)))
    del workbook["config"]
    output = BytesIO()
    workbook.save(output)
    derived = parse_workbook(output.getvalue())
    assert derived.as_of == data.as_of
    assert derived.review_days == 14
    assert derived.products == data.products


async def test_http_success_errors_and_openapi(preview_app):
    async with AsyncClient(
        transport=ASGITransport(app=preview_app), base_url="http://test"
    ) as client:
        demo = await client.get("/api/v1/replenishment/demo")
        assert demo.status_code == 200
        result = await client.post("/api/v1/replenishment/calculate", json=demo.json())
        assert result.status_code == 200
        assert len(result.json()["recommendations"]) == 3

        template = await client.get("/api/v1/replenishment/template")
        assert template.status_code == 200
        assert template.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        imported = await client.post(
            "/api/v1/replenishment/import",
            files={"file": ("demo.xlsx", template.content)},
        )
        assert imported.status_code == 200
        assert imported.json() == demo.json()

        invalid = await client.post(
            "/api/v1/replenishment/import", files={"file": ("bad.xlsx", b"not an xlsx")}
        )
        assert invalid.status_code == 422
        invalid_type = await client.post(
            "/api/v1/replenishment/import", files={"file": ("bad.csv", b"x")}
        )
        assert invalid_type.status_code == 415
        invalid_data = deepcopy(demo.json())
        invalid_data["stock"][0]["quantity"] = -1
        assert (
            await client.post("/api/v1/replenishment/calculate", json=invalid_data)
        ).status_code == 422

        openapi = (await client.get("/openapi.json")).json()
        for path in ("demo", "calculate", "import", "template"):
            assert f"/api/v1/replenishment/{path}" in openapi["paths"]
        assert "/api/v1/replenishment/runs" in openapi["paths"]
        preview = openapi["paths"]["/api/v1/replenishment/calculate"]["post"]
        persisted = openapi["paths"]["/api/v1/replenishment/runs"]["post"]
        assert preview["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
            "/CalculationInput"
        )
        assert persisted["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
            "/CreateCalculation"
        )


@pytest.mark.parametrize(
    "path,method", [("demo", "GET"), ("template", "GET"), ("calculate", "POST"), ("import", "POST")]
)
@pytest.mark.parametrize("authorized,expected", [(False, 401), (True, 403)])
async def test_preview_requires_authentication_and_permissions(path, method, authorized, expected):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    if authorized:
        app.dependency_overrides[get_current_user] = lambda: User(
            id=uuid4(), first_name="Без доступа", roles=[], permissions=[]
        )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, f"/api/v1/replenishment/{path}")
        assert response.status_code == expected


def test_input_validation_and_inbound_after_horizon():
    data = demo_input()
    baseline = _line(calculate(data), "EK-CABLE-25")
    late = deepcopy(data)
    late.inbound[0].eta = data.as_of + timedelta(days=100)
    result = _line(calculate(late), "EK-CABLE-25")
    assert result.recommended_qty == baseline.recommended_qty + 25
    assert result.metrics.inbound == 0


def test_past_due_inbound_is_not_counted_twice_with_current_stock():
    data = demo_input()
    baseline = _line(calculate(data), "EK-CABLE-25")
    stale = deepcopy(data)
    stale.inbound[0].eta = data.as_of - timedelta(days=1)
    result = _line(calculate(stale), "EK-CABLE-25")
    assert result.metrics.inbound == baseline.metrics.inbound - stale.inbound[0].quantity
    assert result.recommended_qty == baseline.recommended_qty + stale.inbound[0].quantity


def test_minimum_order_and_no_positive_need():
    data = demo_input()
    data.suppliers[1].min_order_qty = 500
    result = _line(calculate(data), "EK-SWITCH-16")
    assert result.recommended_qty == 500
    assert "Минимальная партия" in result.explanation

    data.stock[1].quantity = 10_000
    assert all(row.sku != "EK-SWITCH-16" for row in calculate(data).recommendations)


def test_duplicate_and_unknown_references_are_rejected():
    raw = demo_input().model_dump(mode="json")
    raw["products"].append(deepcopy(raw["products"][0]))
    with pytest.raises(ValidationError, match="duplicate products.sku"):
        CalculationInput.model_validate(raw)
    raw["products"].pop()
    raw["products"][0]["supplier_id"] = "missing"
    with pytest.raises(ValidationError, match="unknown supplier"):
        CalculationInput.model_validate(raw)
