from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

from test_replenishment_engine import AS_OF, snapshot

from app.Domains.Replenishment.services.engine import calculate
from app.Domains.Replenishment.services.explanation import amount, explain_saved
from app.Domains.Replenishment.services.replenishment_service import ReplenishmentService


def saved(status="blocked", warnings=()):
    values = calculate(snapshot(), AS_OF)[0]
    values.update(id=uuid4(), run_id=uuid4(), warehouse_id=uuid4(), status=status)
    values["details"]["warnings"] = list(warnings)
    return SimpleNamespace(**values)


def test_blocked_explanation_deduplicates_aliases_and_never_suggests_order():
    row = saved(
        warnings=[
            "current_stock_missing",
            "missing_stock_snapshot",
            "lead_time_missing",
            "missing_lead_time",
        ]
    )
    text = explain_saved(row)
    assert text.count("нет достоверного остатка") == 1
    assert text.count("не указан срок поставки") == 1
    assert "загрузите актуальные остатки" in text
    assert "current_stock_missing" not in text
    assert "280" not in text


def test_unknown_blocker_has_safe_action_without_leaking_technical_code():
    text = explain_saved(saved(warnings=["future_technical_reason"]))
    assert "Недостаточно данных" in text
    assert "Источники данных" in text
    assert "future_technical_reason" not in text


def test_ready_and_zero_order_templates_use_saved_values_without_modifying_them():
    row = saved("ready")
    before = deepcopy(row.details)
    assert "Рекомендуем заказать 280 м" in explain_saved(row)
    assert "Доступно 0 м" in explain_saved(row)
    row.recommended_quantity = "0.000000"
    assert explain_saved(row).startswith("Пополнение сейчас не требуется.")
    assert row.details == before


def test_display_rounding_is_marked_and_exact_order_quantity_is_preserved():
    assert amount("25.000003", "шт.", estimate=True) == "≈ 25"
    assert amount("1.250000", "м", estimate=True) == "1,25"
    assert amount("0.000003", "м") == "0,000003"
    assert amount("100.000000") == "100"


async def test_list_and_detail_refresh_old_explanation_without_rewriting_saved_result():
    row = saved(warnings=["missing_stock_snapshot"])
    old_text = row.explanation

    class Repository:
        async def get_run(self, identifier):
            return SimpleNamespace(status="done")

        async def recommendations(self, *args):
            return [(row, None)], 1

        async def get_recommendation(self, identifier):
            return row, None

    service = ReplenishmentService(Repository())
    page = await service.recommendations(row.run_id, 50, 0, None, None)
    detail = await service.recommendation(row.id)
    assert page["items"][0].explanation == detail.explanation
    assert "нет достоверного остатка" in detail.explanation
    assert (
        detail.recommended_quantity == row.recommended_quantity
        or str(detail.recommended_quantity) == row.recommended_quantity
    )
    assert row.explanation == old_text
