"""Complete purchasing workflow against PostgreSQL, rolled back after each test."""

import os
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.database import get_session
from app.Domains.Jobs import dependencies as job_dependencies
from app.Domains.Replenishment import tasks
from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import Permission, User
from app.main import app
from app.seed.seed import PERMISSIONS

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")


async def test_exchange_calculation_order_export_and_replayed_worker(monkeypatch):
    engine = create_async_engine(get_settings().database_url)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        factory = async_sessionmaker(
            connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        async with factory() as session, session.begin():
            actor = User(first_name="Сквозной тест", roles=[], permissions=[])
            session.add(actor)
            await session.flush()
            actor_id = actor.id
        assert actor_id.version == 7

        async def request_session():
            async with factory() as session, session.begin():
                yield session

        app.dependency_overrides[get_session] = request_session
        app.dependency_overrides[get_current_user] = lambda: User(
            id=actor_id,
            first_name="Тест",
            roles=[],
            permissions=[Permission(code=code, name=code) for code in PERMISSIONS],
        )
        monkeypatch.setattr(tasks, "session_factory", factory)
        monkeypatch.setattr(job_dependencies, "session_factory", factory)
        try:
            async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:

                async def post(path, body, status=200):
                    response = await client.post("/api/v1" + path, json=body)
                    assert response.status_code == status, response.text
                    return response.json()

                source = await post(
                    "/integrations/1c/sources", {"name": "E2E", "system": "1c"}, 201
                )
                as_of = date.today() - timedelta(days=1)
                rows = [
                    {
                        "kind": "categories",
                        "external_id": "category",
                        "revision": 1,
                        "name": "Электрика",
                        "review_days": 7,
                        "safety_days": 7,
                    },
                    {
                        "kind": "warehouses",
                        "external_id": "warehouse",
                        "revision": 1,
                        "name": "Склад",
                        "organization_external_id": "org-1",
                    },
                ]
                for index in (1, 2):
                    rows.extend(
                        [
                            {
                                "kind": "suppliers",
                                "external_id": f"supplier-{index}",
                                "revision": 1,
                                "name": f"Поставщик {index}",
                            },
                            {
                                "kind": "products",
                                "external_id": f"product-{index}",
                                "revision": 1,
                                "sku": f"001-{index}_",
                                "code": f"000{index}_",
                                "name": f"Товар {index}",
                                "unit": "шт",
                                "category_external_id": "category",
                                "supplier_external_id": f"supplier-{index}",
                                "lead_time_days": 7,
                            },
                            {
                                "kind": "stocks",
                                "external_id": f"stock-{index}",
                                "revision": 1,
                                "product_external_id": f"product-{index}",
                                "warehouse_external_id": "warehouse",
                                "quantity": "0",
                                "as_of": f"{as_of}T12:00:00+00:00",
                            },
                        ]
                    )
                    for offset in range(90):
                        rows.append(
                            {
                                "kind": "sales",
                                "external_id": f"sale-{index}-{offset}",
                                "revision": 1,
                                "product_external_id": f"product-{index}",
                                "warehouse_external_id": "warehouse",
                                "date": (as_of - timedelta(days=offset)).isoformat(),
                                "document_id": f"document-{index}-{offset}",
                                "line_id": "1",
                                "quantity": "10",
                                "client_id": "anonymous-client",
                            }
                        )
                batch = {
                    "batch_key": "initial",
                    "expected_revision": 0,
                    "cursor": "1",
                    "complete": True,
                    "rows": rows,
                }
                first = await post(f"/integrations/1c/sources/{source['id']}/batches", batch)
                replay = await post(f"/integrations/1c/sources/{source['id']}/batches", batch)
                assert first == replay
                warehouses = (await client.get("/api/v1/catalogs/warehouses")).json()
                warehouse = next(w for w in warehouses if w["source_id"] == source["id"])
                run = await post(
                    "/replenishment/runs",
                    {
                        "warehouse_id": warehouse["id"],
                        "as_of": str(as_of),
                        "idempotency_key": "calculate-e2e",
                    },
                    202,
                )
                assert UUID(run["id"]).version == 7
                assert run["status"] == "queued"
                await tasks.calculate_replenishment({}, run["job_id"], run["id"])
                result_url = f"/api/v1/replenishment/runs/{run['id']}/recommendations"
                response = await client.get(result_url)
                assert response.status_code == 200, response.text
                recommendations = response.json()
                assert recommendations["total"] == 2
                assert len(recommendations["supplier_groups"]) == 2
                assert all(Decimal(r["recommended_quantity"]) > 0 for r in recommendations["items"])
                await tasks.calculate_replenishment({}, run["job_id"], run["id"])
                assert (await client.get(result_url)).json() == recommendations
                job = (await client.get(f"/api/v1/jobs/{run['job_id']}")).json()
                assert job["status"] == "done", job

                orders = await post(
                    "/orders/from-recommendations",
                    {
                        "recommendation_ids": [r["id"] for r in recommendations["items"]],
                        "idempotency_key": "orders-e2e",
                    },
                    201,
                )
                assert len(orders) == 2
                order = orders[0]
                assert UUID(order["id"]).version == 7
                line = order["lines"][0]
                response = await client.patch(
                    f"/api/v1/orders/{order['id']}/lines/{line['id']}",
                    json={
                        "expected_version": order["version"],
                        "quantity": "123.5",
                        "reason": "Проверка менеджером",
                    },
                )
                assert response.status_code == 200, response.text
                order = response.json()
                approved = await post(
                    f"/orders/{order['id']}/approve", {"expected_version": order["version"]}
                )
                assert approved["status"] == "approved"
                export = await client.get(f"/api/v1/orders/{order['id']}/export?format=csv")
                assert export.status_code == 200 and b"123.5" in export.content
                handoff = (await client.get(f"/api/v1/orders/{order['id']}/1c")).json()
                assert handoff["order"]["external_references"]
                acknowledgement = {
                    "revision": approved["revision"],
                    "status": "accepted",
                    "external_document_id": "1c-order-001",
                }
                ack = await post(f"/orders/{order['id']}/1c/ack", acknowledgement)
                assert ack == await post(f"/orders/{order['id']}/1c/ack", acknowledgement)
                forbidden = await client.patch(
                    f"/api/v1/orders/{order['id']}",
                    json={
                        "expected_version": approved["version"],
                        "comment": "Изменить",
                        "reason": "Проверка неизменности",
                    },
                )
                assert forbidden.status_code == 409
                overview = await client.get(f"/api/v1/overview?warehouse_id={warehouse['id']}")
                assert overview.status_code == 200, overview.text
                assert overview.json()["draft_order_count"] == 1
        finally:
            app.dependency_overrides.pop(get_session, None)
            app.dependency_overrides.pop(get_current_user, None)
            await transaction.rollback()
    await engine.dispose()
