import csv
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO, StringIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from openpyxl import load_workbook

from app.core.errors import DomainError
from app.Domains.Procurement.controllers.http import router
from app.Domains.Procurement.dependencies import get_order_service
from app.Domains.Procurement.DTO.order import (
    Acknowledge,
    CreateOrders,
    DeleteLine,
    EditLine,
    EditOrder,
    ReviseOrder,
    VersionCommand,
)
from app.Domains.Procurement.models.order import (
    Order,
    OrderAllocation,
    OrderAudit,
    OrderCreation,
    OrderDelivery,
    OrderLine,
)
from app.Domains.Procurement.services.order_service import OrderService
from app.Domains.Security.dependencies import get_current_user


class MemoryRepository:
    def __init__(self):
        self.entities = defaultdict(list)

    async def lock(self, key):
        pass

    async def add(self, entity):
        if hasattr(entity, "id") and entity.id is None:
            entity.id = uuid4()
        if hasattr(entity, "created_at") and entity.created_at is None:
            entity.created_at = datetime.now(UTC)
        self.entities[type(entity)].append(entity)
        return entity

    async def flush(self):
        pass

    async def creation(self, key):
        return next((x for x in self.entities[OrderCreation] if x.idempotency_key == key), None)

    async def allocations(self, ids):
        return [x for x in self.entities[OrderAllocation] if x.recommendation_id in ids]

    async def get(self, identifier, lock=False):
        return next((x for x in self.entities[Order] if x.id == identifier), None)

    async def list(self, limit, offset, status, supplier_id, warehouse_id):
        return [
            x
            for x in self.entities[Order]
            if (status is None or x.status == status)
            and (supplier_id is None or x.supplier_id == supplier_id)
            and (warehouse_id is None or x.warehouse_id == warehouse_id)
        ][offset : offset + limit]

    async def lines(self, order_id):
        return [x for x in self.entities[OrderLine] if x.order_id == order_id]

    async def delete_line(self, line):
        self.entities[OrderLine].remove(line)

    async def audits(self, order_id, limit, offset):
        return [x for x in self.entities[OrderAudit] if x.order_id == order_id][
            offset : offset + limit
        ]

    async def delivery(self, order_id):
        return next((x for x in self.entities[OrderDelivery] if x.order_id == order_id), None)

    async def successor(self, order_id):
        return next((x for x in self.entities[Order] if x.supersedes_order_id == order_id), None)

    async def revision_event(self, order_id):
        return next(
            (
                x
                for x in self.entities[OrderAudit]
                if x.order_id == order_id and x.action == "revised_from"
            ),
            None,
        )


class MemorySource:
    def __init__(self):
        self.supplier_id, self.warehouse_id = uuid4(), uuid4()
        self.rows = [
            dict(
                id=uuid4(),
                run_id=uuid4(),
                product_id=uuid4(),
                supplier_id=self.supplier_id,
                warehouse_id=self.warehouse_id,
                sku="=SUM(1,2)",
                name="Кабель",
                unit="м",
                recommended_quantity=Decimal("125.123456"),
            )
        ]

    async def recommendations(self, ids):
        return [x.copy() for x in self.rows if x["id"] in ids]

    async def suppliers(self, ids):
        return [dict(id=identifier, name="Поставщик", active=True) for identifier in ids]

    async def references(self, product_ids, supplier_id, warehouse_id):
        def reference(identifier):
            return dict(
                id=identifier,
                source_id=self.supplier_id,
                external_id=f"external:{identifier}",
                name="External name",
            )

        return dict(
            supplier=reference(supplier_id),
            warehouse=reference(warehouse_id),
            products=[
                dict(
                    **reference(identifier),
                    sku="SKU",
                    unit="м",
                    code="0001",
                    characteristic_external_id="char:1",
                )
                for identifier in product_ids
            ],
        )


@pytest.fixture
def context():
    repository, source = MemoryRepository(), MemorySource()
    return SimpleNamespace(
        repository=repository,
        source=source,
        actor=uuid4(),
        service=OrderService(repository, source),
    )


async def create(context, key="first"):
    orders = await context.service.create(
        CreateOrders(
            recommendation_ids=[row["id"] for row in context.source.rows],
            idempotency_key=key,
        ),
        context.actor,
    )
    return orders[0]


async def test_group_by_supplier_and_warehouse_and_creation_idempotency(context):
    first = context.source.rows[0]
    context.source.rows += [
        {**first, "id": uuid4(), "warehouse_id": uuid4()},
        {**first, "id": uuid4(), "supplier_id": uuid4()},
    ]
    original = await create(context)
    repeated = await create(context)
    assert original.id == repeated.id
    assert len(context.repository.entities[Order]) == 3
    with pytest.raises(DomainError):
        await create(context, "another-key")
    context.source.rows = [first]
    with pytest.raises(DomainError):
        await create(context)


async def test_edit_version_conflict_and_approved_snapshot(context):
    order = await create(context)
    edited = await context.service.edit_line(
        order.id,
        order.lines[0].id,
        EditLine(
            expected_version=1,
            quantity="99.000001",
            reason="Уточнение закупщика",
        ),
        context.actor,
    )
    assert edited.version == 2
    with pytest.raises(DomainError):
        await context.service.edit(
            order.id,
            EditOrder(
                expected_version=1,
                comment="stale",
                reason="stale",
            ),
            context.actor,
        )
    approved = await context.service.approve(
        order.id, VersionCommand(expected_version=2), context.actor
    )
    assert approved.status == "approved" and approved.version == 3
    assert approved.approved_by == context.actor and approved.approved_at is not None
    with pytest.raises(DomainError):
        await context.service.edit_line(
            order.id,
            order.lines[0].id,
            EditLine(
                expected_version=3,
                quantity="1",
                reason="forbidden",
            ),
            context.actor,
        )
    # Even a future source/model rename must not rewrite an approved document.
    context.repository.entities[OrderLine][0].name = "Changed catalog name"
    assert (await context.service.get(order.id)).lines[0].name == "Кабель"
    assert [x.action for x in context.repository.entities[OrderAudit]] == [
        "created",
        "line_edited",
        "approved",
    ]


async def test_deleted_line_claim_kept_and_empty_order_not_approved(context):
    order = await create(context)
    await context.service.edit_line(
        order.id,
        order.lines[0].id,
        DeleteLine(
            expected_version=1,
            reason="Отложено",
        ),
        context.actor,
        delete=True,
    )
    with pytest.raises(DomainError):
        await context.service.approve(order.id, VersionCommand(expected_version=2), context.actor)
    with pytest.raises(DomainError):
        await create(context, "second")


async def test_exports_equal_snapshot_quantities_and_no_formula_execution(context):
    order = await create(context)
    with pytest.raises(DomainError):
        await context.service.export(order.id, "csv")
    approved = await context.service.approve(
        order.id, VersionCommand(expected_version=1), context.actor
    )
    csv_data = await context.service.export(order.id, "csv")
    rows = list(csv.DictReader(StringIO(csv_data.decode("utf-8-sig"))))
    assert rows[0]["quantity"] == str(approved.lines[0].quantity)
    assert rows[0]["sku"] == "'=SUM(1,2)"
    xlsx_data = await context.service.export(order.id, "xlsx")
    workbook = load_workbook(BytesIO(xlsx_data))
    assert workbook.active["E2"].value == "=SUM(1,2)"
    assert workbook.active["E2"].data_type == "s"
    assert workbook.active["H2"].value == rows[0]["quantity"]
    workbook.close()
    handoff = await context.service.handoff(order.id)
    assert handoff.order == approved
    assert handoff.idempotency_key == f"order:{order.id}:revision:1"
    assert handoff.delivery.status == "pending"
    assert handoff.order.external_references.products[0].external_id == (
        f"external:{approved.lines[0].product_id}"
    )
    assert handoff.order.external_references.products[0].characteristic_external_id == "char:1"


async def test_ack_is_separate_idempotent_and_accepted_reference_immutable(context):
    order = await create(context)
    approved = await context.service.approve(
        order.id, VersionCommand(expected_version=1), context.actor
    )
    ack = Acknowledge(revision=1, status="accepted", external_document_id="1c:order:1")
    first = await context.service.acknowledge(order.id, ack, context.actor)
    second = await context.service.acknowledge(order.id, ack, context.actor)
    assert first == second
    assert (await context.service.get(order.id)) == approved
    with pytest.raises(DomainError):
        await context.service.acknowledge(
            order.id,
            Acknowledge(
                revision=1,
                status="accepted",
                external_document_id="1c:other",
            ),
            context.actor,
        )
    assert (
        len([x for x in context.repository.entities[OrderAudit] if x.action == "1c_acknowledged"])
        == 1
    )


async def test_safe_revision_requires_rejection_preserves_snapshot_and_blocks_old_handoff(context):
    order = await create(context)
    with pytest.raises(DomainError):
        await context.service.revise(
            order.id, ReviseOrder(expected_version=1, reason="Draft"), context.actor
        )
    approved = await context.service.approve(
        order.id, VersionCommand(expected_version=1), context.actor
    )
    data = ReviseOrder(expected_version=approved.version, reason="Исправить после отказа 1С")
    with pytest.raises(DomainError):
        await context.service.revise(order.id, data, context.actor)
    await context.service.acknowledge(
        order.id,
        Acknowledge(
            revision=1,
            status="rejected",
            message="Ошибка реквизитов",
        ),
        context.actor,
    )
    with pytest.raises(DomainError):
        await context.service.handoff(order.id)
    with pytest.raises(DomainError):
        await context.service.revise(
            order.id, ReviseOrder(expected_version=1, reason=data.reason), context.actor
        )
    revised = await context.service.revise(order.id, data, context.actor)
    assert revised.id != order.id and revised.supersedes_order_id == order.id
    assert revised.revision == 2 and revised.version == 1 and revised.status == "draft"
    assert revised.lines[0].id != order.lines[0].id
    assert revised.lines[0].recommendation_id == order.lines[0].recommendation_id
    assert revised.lines[0].quantity == approved.lines[0].quantity
    assert revised.external_references == approved.external_references
    assert (await context.service.revise(order.id, data, context.actor)).id == revised.id
    with pytest.raises(DomainError):
        await context.service.revise(
            order.id,
            ReviseOrder(
                expected_version=approved.version,
                reason="Другой запрос",
            ),
            context.actor,
        )
    assert len(context.repository.entities[OrderAllocation]) == 1
    assert await context.service.get(order.id) == approved
    assert (await context.service.export(order.id, "csv")).startswith(b"\xef\xbb\xbf")
    with pytest.raises(DomainError):
        await context.service.handoff(order.id)
    with pytest.raises(DomainError):
        await context.service.acknowledge(
            order.id,
            Acknowledge(
                revision=1,
                status="accepted",
                external_document_id="late-ack",
            ),
            context.actor,
        )
    new_approved = await context.service.approve(
        revised.id, VersionCommand(expected_version=1), context.actor
    )
    handoff = await context.service.handoff(revised.id)
    assert handoff.idempotency_key == f"order:{revised.id}:revision:2"
    assert handoff.order == new_approved
    assert [x.action for x in context.repository.entities[OrderAudit]].count("superseded") == 1


async def test_accepted_order_cannot_be_revised(context):
    order = await create(context)
    approved = await context.service.approve(
        order.id, VersionCommand(expected_version=1), context.actor
    )
    await context.service.acknowledge(
        order.id,
        Acknowledge(
            revision=1,
            status="accepted",
            external_document_id="already-in-1c",
        ),
        context.actor,
    )
    with pytest.raises(DomainError):
        await context.service.revise(
            order.id,
            ReviseOrder(
                expected_version=approved.version,
                reason="Cannot change accepted purchase",
            ),
            context.actor,
        )


@pytest.mark.parametrize("quantity", ["0", "-1", "NaN", "0.0000001"])
def test_invalid_quantities(quantity):
    with pytest.raises(ValueError):
        EditLine(expected_version=1, quantity=quantity, reason="reason")


@pytest.fixture
async def api(context):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_order_service] = lambda: context.service
    context.permissions = {"orders.read", "orders.write", "orders.export"}
    user = SimpleNamespace(
        id=context.actor,
        has_permission=lambda code: code in context.permissions,
        get_permissions=lambda: context.permissions,
    )
    app.dependency_overrides[get_current_user] = lambda: user
    from fastapi.responses import JSONResponse

    @app.exception_handler(DomainError)
    async def error_handler(request, error):
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail})

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_api_forbidden_approval_and_version_conflict(api, context):
    order = await create(context)
    response = await api.post(f"/api/v1/orders/{order.id}/approve", json={"expected_version": 1})
    assert response.status_code == 403
    assert (await context.service.get(order.id)).status == "draft"
    context.permissions.add("orders.approve")
    response = await api.patch(
        f"/api/v1/orders/{order.id}/lines/{order.lines[0].id}",
        json={
            "expected_version": 1,
            "quantity": "2.5",
            "reason": "Согласовано",
        },
    )
    assert response.status_code == 200
    stale = await api.post(f"/api/v1/orders/{order.id}/approve", json={"expected_version": 1})
    assert stale.status_code == 409
    assert (
        await api.post(
            f"/api/v1/orders/{order.id}/approve",
            json={
                "expected_version": 2,
            },
        )
    ).status_code == 200
    export = await api.get(f"/api/v1/orders/{order.id}/export?format=csv")
    assert export.status_code == 200 and "text/csv" in export.headers["content-type"]
    assert "attachment" in export.headers["content-disposition"]
    assert export.headers["cache-control"] == "no-store"
    schema = (await api.get("/openapi.json")).json()
    operation = schema["paths"]["/api/v1/orders/{order_id}/export"]["get"]
    assert "text/csv" in operation["responses"]["200"]["content"]


async def test_api_requires_authentication():
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_order_service] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/v1/orders")).status_code == 401


async def test_api_revision_requires_write_and_exports_actual_revision(api, context):
    order = await create(context)
    approved = await context.service.approve(
        order.id, VersionCommand(expected_version=1), context.actor
    )
    payload = {"expected_version": approved.version, "reason": "Исправление после отказа"}
    assert (await api.post(f"/api/v1/orders/{order.id}/revise", json=payload)).status_code == 409
    await context.service.acknowledge(
        order.id, Acknowledge(revision=1, status="rejected"), context.actor
    )
    context.permissions.remove("orders.write")
    assert (await api.post(f"/api/v1/orders/{order.id}/revise", json=payload)).status_code == 403
    context.permissions.add("orders.write")
    response = await api.post(f"/api/v1/orders/{order.id}/revise", json=payload)
    assert response.status_code == 201
    new_id = response.json()["id"]
    assert response.json()["supersedes_order_id"] == str(order.id)
    context.permissions.add("orders.approve")
    approval = await api.post(f"/api/v1/orders/{new_id}/approve", json={"expected_version": 1})
    assert approval.status_code == 200
    export = await api.get(f"/api/v1/orders/{new_id}/export?format=csv")
    assert "-r2.csv" in export.headers["content-disposition"]
