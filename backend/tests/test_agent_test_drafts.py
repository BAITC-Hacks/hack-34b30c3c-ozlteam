from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.errors import DomainError
from app.Domains.Ai.adapters.business_tools import BusinessTools
from app.Domains.Ai.DTO.agent_tools import CreateTestSupplierDraftArgs
from app.Domains.Ai.services.agent_engine import AgentEngine
from app.Domains.Ai.services.supplier_matching import test_selection_is_explicit as explicit_test
from tests.test_agent_engine import Provider, Tools


def request():
    return dict(
        supplier_id=str(uuid4()),
        supplier_request_text="IEK",
        warehouse_id=str(uuid4()),
        product_count=5,
        test_request_text="тестовый заказ",
        selection_request_text="любые 5 товаров",
    )


@pytest.mark.parametrize(
    "message,allowed",
    [
        ("Создай тестовый заказ IEK, любые 5 товаров", True),
        ("Создай заказ IEK, любые 5 товаров", False),
        ("Создай тестовый заказ IEK, 5 товаров", False),
        ("Создай не тестовый заказ IEK, любые 5 товаров", False),
        ("Создай тестовый заказ IEK, любые 3 товара", False),
    ],
)
def test_test_selection_requires_user_delegation_count_and_test_intent(message, allowed):
    assert explicit_test(CreateTestSupplierDraftArgs(**request()), [message]) is allowed


def test_old_delegated_count_cannot_override_latest_count():
    assert not explicit_test(
        CreateTestSupplierDraftArgs(**request()),
        [
            "тестовый заказ, любые 5 товаров",
            "Нет, любые 3 товара",
        ],
    )


def test_past_test_order_does_not_authorize_new_ordinary_order():
    assert not explicit_test(
        CreateTestSupplierDraftArgs(**request()),
        ["Создай тестовый заказ IEK, любые 5 товаров", "Создай заказ IEK"],
    )


@pytest.mark.parametrize(
    "selection",
    [
        "Выбери 5 любых товаров для заказа IEK",
        "любые пять товаров",
        "пять произвольных доступных товаров",
        "любых ПЯТЬ разных позиций",
        "подбери 5 товаров самостоятельно",
        "возьми сам пять товаров",
        "5 arbitrary products",
    ],
)
def test_test_selection_accepts_natural_word_order_and_delegation(selection):
    payload = {**request(), "selection_request_text": selection}
    assert explicit_test(
        CreateTestSupplierDraftArgs(**payload),
        ["Нужен тестовый заказ IEK", selection],
    )


@pytest.mark.parametrize(
    "selection",
    [
        "Выбери 5 любых товаров для заказа IEK",
        "любые пять товаров",
        "подбери 5 товаров самостоятельно",
    ],
)
def test_delegated_selection_still_requires_actual_user_test_intent(selection):
    payload = {**request(), "selection_request_text": selection}
    assert not explicit_test(CreateTestSupplierDraftArgs(**payload), [selection])


@pytest.mark.parametrize(
    "selection", ["любые -5 товаров", "любые 1.5 товаров", "не любые 5 товаров"]
)
def test_test_selection_rejects_invalid_count_and_negated_delegation(selection):
    payload = {**request(), "selection_request_text": selection}
    assert not explicit_test(
        CreateTestSupplierDraftArgs(**payload), ["Нужен тестовый заказ IEK", selection]
    )


def test_reordered_latest_count_overrides_earlier_delegation():
    assert not explicit_test(
        CreateTestSupplierDraftArgs(**request()),
        ["Создай тестовый заказ IEK, любые 5 товаров", "Выбери 3 любых товара"],
    )


def accepted_request():
    return CreateTestSupplierDraftArgs(
        **{
            **request(),
            "test_request_text": "Да, сделай",
            "selection_request_text": "5 любыми товарами",
        }
    )


def test_user_can_accept_test_offer_after_ordinary_order_request():
    assert explicit_test(
        accepted_request(),
        ["Создай заказ IEK с 5 любыми товарами", "Да, сделай"],
        accepted_test_request="Да, сделай",
    )


@pytest.mark.parametrize(
    "later_request", ["Создай заказ IEK", "Нет, не тестовый заказ", "Выбери 3 любых товара"]
)
def test_accepted_test_offer_does_not_override_later_request(later_request):
    assert not explicit_test(
        accepted_request(),
        ["Создай заказ IEK с 5 любыми товарами", "Да, сделай", later_request],
        accepted_test_request="Да, сделай",
    )


def test_unquoted_acceptance_cannot_supply_test_intent():
    assert not explicit_test(
        accepted_request(),
        ["Создай заказ IEK с 5 любыми товарами"],
        accepted_test_request="Да, сделай",
    )


def test_unresolved_affirmative_does_not_supply_test_intent():
    assert not explicit_test(
        accepted_request(),
        ["Создай заказ IEK с 5 любыми товарами", "Да, сделай"],
    )


async def test_test_order_proposal_is_read_only_and_uses_selected_warehouse_context():
    payload = request()
    tools = Tools()
    tools.supplier_directory = AsyncMock(
        return_value=[{"id": payload["supplier_id"], "name": "IEK", "source_id": str(uuid4())}]
    )
    tools.validate_draft_warehouse = AsyncMock(return_value=None)
    provider = Provider({"proposal": {"kind": "create_test_supplier_draft", "payload": payload}})
    result = await AgentEngine(provider, tools).run(
        "Создай тестовый заказ IEK, любые 5 товаров",
        [],
        "procurement",
        context={"warehouse_id": payload["warehouse_id"]},
        allow_business_data=True,
    )
    assert result["proposal"]["kind"] == "create_test_supplier_draft"
    assert tools.validate_draft_warehouse.await_args.args[2] == payload["warehouse_id"]
    assert "Пока изменения не внесены" in result["content"]


@pytest.mark.parametrize("consent", [True, False])
async def test_ordinary_order_cannot_bypass_manual_evidence_with_test_tool(consent):
    payload = request()
    tools = Tools()
    tools.supplier_directory = AsyncMock(
        return_value=[{"id": payload["supplier_id"], "name": "IEK", "source_id": str(uuid4())}]
    )
    tools.validate_draft_warehouse = AsyncMock(return_value=None)
    provider = Provider(
        {"proposal": {"kind": "create_test_supplier_draft", "payload": payload}},
        "Уточните товары.",
    )
    result = await AgentEngine(provider, tools).run(
        "Создай заказ IEK",
        [],
        "procurement",
        context={"warehouse_id": payload["warehouse_id"]},
        allow_business_data=consent,
    )
    assert result["proposal"] is None and tools.proposals == []
    tools.validate_draft_warehouse.assert_not_awaited()


def adapter(monkeypatch, count=5, wrong_source=False):
    payload = request()
    command = CreateTestSupplierDraftArgs(**payload)
    source_id = uuid4()
    supplier = SimpleNamespace(id=command.supplier_id, active=True, source_id=source_id, name="IEK")
    warehouse = SimpleNamespace(
        id=command.warehouse_id,
        active=True,
        source_id=uuid4() if wrong_source else source_id,
        name="Алматы",
    )
    products = [SimpleNamespace(id=uuid4(), unit="шт") for _ in range(count)]
    catalogs = SimpleNamespace(
        get=AsyncMock(
            side_effect=lambda kind, identifier: supplier if kind == "suppliers" else warehouse
        ),
        list=AsyncMock(return_value=products),
    )

    async def preview(draft):
        return {
            "supplier": {"name": "IEK"},
            "warehouse": {"name": "Алматы"},
            "lines": [
                {
                    "product_id": str(line.product_id),
                    "sku": "SKU",
                    "name": "Товар",
                    "unit": "шт",
                    "quantity": str(line.quantity),
                }
                for line in draft.lines
            ],
        }

    order = SimpleNamespace(
        lines=[], model_dump=lambda **kwargs: {"id": str(uuid4()), "status": "draft"}
    )
    orders = SimpleNamespace(
        preview_supplier_draft=AsyncMock(side_effect=preview),
        create_supplier_draft=AsyncMock(return_value=order),
    )
    tools = BusinessTools(None, SimpleNamespace(id=uuid4(), has_permission=lambda code: True))
    monkeypatch.setattr(tools, "_catalogs", lambda: catalogs)
    monkeypatch.setattr(tools, "_orders", lambda: orders)
    return tools, payload, catalogs, orders, products, source_id


async def test_test_preview_selects_server_products_then_confirm_creates_marked_draft(monkeypatch):
    tools, payload, catalogs, orders, products, source_id = adapter(monkeypatch)
    preview = await tools.prepare("create_test_supplier_draft", payload)
    assert preview["preview"]["is_test"]
    assert len(preview["preview"]["lines"]) == 5
    assert {row["quantity"] for row in preview["preview"]["lines"]} == {"1"}
    orders.create_supplier_draft.assert_not_awaited()
    args = catalogs.list.await_args.args
    assert args[1:5] == (200, 0, None, True)
    assert args[-2:] == (source_id, CreateTestSupplierDraftArgs(**payload).supplier_id)
    result = await tools.confirm("create_test_supplier_draft", payload, "test-confirmation-key")
    assert result["orders"][0]["status"] == "draft"
    draft, _ = orders.create_supplier_draft.await_args.args
    assert draft.comment.startswith("[ТЕСТОВЫЙ ЗАКАЗ]")
    assert draft.idempotency_key == "test-confirmation-key"
    assert [line.product_id for line in draft.lines] == [row.id for row in products]


async def test_test_selection_skips_unknown_units_and_reads_next_catalog_page(monkeypatch):
    tools, payload, catalogs, orders, products, _ = adapter(monkeypatch)
    unknown = [SimpleNamespace(id=uuid4(), unit="не определена") for _ in range(200)]
    catalogs.list = AsyncMock(side_effect=[unknown, products])
    result = await tools.prepare("create_test_supplier_draft", payload)
    assert len(result["preview"]["lines"]) == 5
    assert catalogs.list.await_args.args[2] == 200
    draft = orders.preview_supplier_draft.await_args.args[0]
    assert [line.product_id for line in draft.lines] == [row.id for row in products]


@pytest.mark.parametrize(
    "count,wrong_source,code",
    [
        (0, False, "test_products_insufficient"),
        (3, False, "test_products_insufficient"),
        (5, True, "test_source_mismatch"),
    ],
)
async def test_no_partial_test_order_or_cross_source_selection(
    monkeypatch, count, wrong_source, code
):
    tools, payload, _, orders, _, _ = adapter(monkeypatch, count, wrong_source)
    with pytest.raises(DomainError) as error:
        await tools.prepare("create_test_supplier_draft", payload)
    assert error.value.code == code
    orders.create_supplier_draft.assert_not_awaited()
