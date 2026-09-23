import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.Domains.Ai.adapters.business_tools import BusinessTools
from app.Domains.Ai.DTO.agent_tools import CreateSupplierDraftArgs
from app.Domains.Ai.services.agent_engine import AgentEngine
from app.Domains.Ai.services.supplier_matching import (
    quantities_are_explicit,
    supplier_is_explicit,
    supplier_matches,
)
from tests.test_agent_engine import Provider, Tools


def draft_request():
    supplier, warehouse, product = map(str, [uuid4(), uuid4(), uuid4()])
    payload = {
        "supplier_id": supplier,
        "supplier_request_text": "IEK",
        "warehouse_id": warehouse,
        "lines": [{"product_id": product, "quantity": "10", "request_text": "CABLE-01 — 10 шт"}],
    }
    directory = [{"id": supplier, "name": "IEK", "source_id": str(uuid4())}]
    preview = {"lines": [{"product_id": product, "sku": "CABLE-01", "name": "Кабель"}]}
    return payload, directory, preview


def test_fuzzy_supplier_and_same_names_require_explicit_selection():
    payload, suppliers, _ = draft_request()
    assert supplier_matches("иэк", suppliers)["match"] == "similar"
    payload["supplier_request_text"] = "иэк"
    assert not supplier_is_explicit(CreateSupplierDraftArgs(**payload), suppliers, ["Заказ иэк"])
    suppliers.append({**suppliers[0], "id": str(uuid4()), "source_id": str(uuid4())})
    payload["supplier_request_text"] = "IEK"
    assert not supplier_is_explicit(CreateSupplierDraftArgs(**payload), suppliers, ["IEK"])
    payload["supplier_request_text"] = payload["supplier_id"]
    assert supplier_is_explicit(
        CreateSupplierDraftArgs(**payload), suppliers, [payload["supplier_id"]]
    )


@pytest.mark.parametrize(
    "quote", ["CABLE-01", "CABLE-01 на 10.10.2026", "CABLE-01 — 9 шт", "CABLE-01 -10 шт"]
)
def test_quantities_cannot_be_invented_or_taken_from_sku_or_date(quote):
    payload, _, preview = draft_request()
    payload["lines"][0]["request_text"] = quote
    assert not quantities_are_explicit(CreateSupplierDraftArgs(**payload), preview, [quote])


def test_manual_quantity_must_be_quoted_and_linked_to_product():
    payload, _, preview = draft_request()
    command = CreateSupplierDraftArgs(**payload)
    assert quantities_are_explicit(command, preview, ["Купи CABLE-01 — 10 шт"])
    assert not quantities_are_explicit(command, preview, ["Создай заказ IEK"])
    assert not quantities_are_explicit(command, preview, ["CABLE-01 — 10 шт", "CABLE-01 — 20 шт"])


def test_latest_supplier_selection_supersedes_older_name():
    payload, suppliers, _ = draft_request()
    suppliers.append({"id": str(uuid4()), "name": "Systeme Electric", "source_id": str(uuid4())})
    assert not supplier_is_explicit(
        CreateSupplierDraftArgs(**payload), suppliers, ["Заказ IEK", "Теперь Systeme Electric"]
    )


async def test_supplier_directory_includes_every_page_with_identity_only(monkeypatch):
    tools = BusinessTools(None, SimpleNamespace(has_permission=lambda code: True))
    rows = [
        {
            "id": str(uuid4()),
            "name": f"Supplier {n}",
            "source_id": str(uuid4()),
            "private": "hidden",
        }
        for n in range(221)
    ]
    catalogs = SimpleNamespace(list=AsyncMock(side_effect=[rows[:200], rows[200:]]))
    monkeypatch.setattr(tools, "_catalogs", lambda: catalogs)
    directory = await tools.supplier_directory()
    assert len(directory) == 221 and "hidden" not in json.dumps(directory)
    assert catalogs.list.await_args.args[2] == 200


async def test_full_supplier_context_not_truncated_and_consent_respected():
    tools = Tools()
    directory = [
        {"id": str(uuid4()), "name": f"Supplier {n}", "source_id": str(uuid4())} for n in range(31)
    ]
    tools.supplier_directory = AsyncMock(return_value=directory)
    provider = Provider({}, "Укажите товары и количества.")
    await AgentEngine(provider, tools).run(
        "Заказ Supplier 30", [], "procurement", allow_business_data=True
    )
    assert all(row["id"] in json.dumps(provider.requests) for row in directory)
    tools.supplier_directory.reset_mock()
    provider = Provider({}, "Включите доступ.")
    await AgentEngine(provider, tools).run("Заказ Supplier 30", [], "procurement")
    tools.supplier_directory.assert_not_awaited()
    assert directory[0]["id"] not in json.dumps(provider.requests)


async def test_internal_planning_instructions_do_not_leak_into_answer_prompt():
    provider = Provider({}, "Назовите товары и количество каждого.")
    await AgentEngine(provider, Tools()).run(
        "Создай заказ поставщику",
        [],
        "procurement",
        allow_business_data=True,
    )
    assert "пустой план {}" in provider.requests[0]["system"]
    final_prompt = provider.requests[-1]["system"]
    assert "пустой план {}" not in final_prompt
    assert "create_supplier_draft" not in final_prompt
    assert "Не показывай внутренние планы" in final_prompt


async def test_supplier_only_cannot_become_a_fabricated_draft():
    payload, directory, preview = draft_request()
    tools = Tools()
    tools.supplier_directory = AsyncMock(return_value=directory)
    tools.prepare = AsyncMock(return_value={"kind": "create_supplier_draft", "preview": preview})
    provider = Provider({"proposal": {"kind": "create_supplier_draft", "payload": payload}})
    result = await AgentEngine(provider, tools).run(
        "Создай заказ IEK",
        [],
        "procurement",
        allow_business_data=True,
        context={
            "product_id": payload["lines"][0]["product_id"],
            "warehouse_id": payload["warehouse_id"],
        },
    )
    assert result["proposal"] is None
    assert "Укажите товары и количество" in result["content"]


async def test_fuzzy_match_cannot_silently_select_supplier():
    payload, directory, _ = draft_request()
    payload["supplier_request_text"] = "иэк"
    tools = Tools()
    tools.supplier_directory = AsyncMock(return_value=directory)
    provider = Provider({"proposal": {"kind": "create_supplier_draft", "payload": payload}})
    result = await AgentEngine(provider, tools).run(
        "Заказ иэк CABLE-01 — 10 шт",
        [],
        "procurement",
        allow_business_data=True,
        context={
            "product_id": payload["lines"][0]["product_id"],
            "warehouse_id": payload["warehouse_id"],
        },
    )
    assert result["proposal"] is None and tools.proposals == []
    assert "Вы имели в виду «IEK»" in result["content"]


async def test_explicit_manual_lines_produce_only_a_confirmation_proposal():
    payload, directory, preview = draft_request()
    tools = Tools()
    tools.supplier_directory = AsyncMock(return_value=directory)
    tools.validate_draft_selection = AsyncMock(return_value=None)
    tools.prepare = AsyncMock(
        return_value={
            "kind": "create_supplier_draft",
            "preview": preview,
            "payload": payload,
            "title": "Создать черновик",
            "summary": "Нужно подтверждение.",
        }
    )
    provider = Provider({"proposal": {"kind": "create_supplier_draft", "payload": payload}})
    result = await AgentEngine(provider, tools).run(
        "CABLE-01 — 10 шт",
        [{"role": "user", "content": "Создай заказ IEK"}],
        "procurement",
        allow_business_data=True,
        context={
            "product_id": payload["lines"][0]["product_id"],
            "warehouse_id": payload["warehouse_id"],
        },
    )
    assert result["proposal"]["kind"] == "create_supplier_draft"
    assert "Пока изменения не внесены" in result["content"]
    tools.validate_draft_selection.assert_awaited_once()


async def test_ambiguous_warehouse_prevents_proposal(monkeypatch):
    payload, _, preview = draft_request()
    command = CreateSupplierDraftArgs(**payload)
    warehouse = SimpleNamespace(id=command.warehouse_id, name="Алматы", source_id=uuid4())
    tools = BusinessTools(None, SimpleNamespace(has_permission=lambda code: True))
    catalogs = SimpleNamespace(
        get=AsyncMock(return_value=warehouse),
        list=AsyncMock(return_value=[warehouse, SimpleNamespace(id=uuid4())]),
    )
    monkeypatch.setattr(tools, "_catalogs", lambda: catalogs)
    result = await tools.validate_draft_selection(command, preview, ["IEK CABLE-01 — 10 шт"])
    assert "склад" in result


async def test_same_product_name_or_sku_requires_unique_identity(monkeypatch):
    payload, _, preview = draft_request()
    command = CreateSupplierDraftArgs(**payload)
    warehouse = SimpleNamespace(id=command.warehouse_id, name="Алматы", source_id=uuid4())
    tools = BusinessTools(None, SimpleNamespace(has_permission=lambda code: True))
    rows = [
        SimpleNamespace(id=uuid4(), sku="CABLE-01", code=str(n), name="Кабель") for n in range(2)
    ]
    catalogs = SimpleNamespace(
        get=AsyncMock(return_value=warehouse), list=AsyncMock(return_value=rows)
    )
    monkeypatch.setattr(tools, "_catalogs", lambda: catalogs)
    result = await tools.validate_draft_selection(
        command,
        preview,
        [str(command.warehouse_id), "CABLE-01 — 10 шт"],
    )
    assert "Уточните товар" in result


async def test_adapter_preview_and_confirmation_preserve_explicit_quantities(monkeypatch):
    payload, directory, preview = draft_request()
    user = SimpleNamespace(id=uuid4(), has_permission=lambda code: True)
    tools = BusinessTools(None, user)
    service_preview = {
        "supplier": directory[0],
        "warehouse": {"name": "Алматы"},
        "lines": preview["lines"],
    }
    order = SimpleNamespace(
        lines=[],
        model_dump=lambda **kwargs: {"id": str(uuid4()), "status": "draft"},
    )
    orders = SimpleNamespace(
        preview_supplier_draft=AsyncMock(return_value=service_preview),
        create_supplier_draft=AsyncMock(return_value=order),
    )
    monkeypatch.setattr(tools, "_orders", lambda: orders)
    prepared = await tools.prepare("create_supplier_draft", payload)
    assert prepared["preview"]["supplier_name"] == "IEK"
    orders.create_supplier_draft.assert_not_awaited()
    result = await tools.confirm("create_supplier_draft", payload, "confirmed-proposal-key")
    assert result["orders"][0]["status"] == "draft"
    command, actor = orders.create_supplier_draft.await_args.args
    assert command.lines[0].quantity == 10 and actor == user.id
    assert command.idempotency_key == "confirmed-proposal-key"
