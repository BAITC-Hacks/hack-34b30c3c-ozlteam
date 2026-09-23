"""Opt-in real-domain agent checks; every synthetic record is rolled back."""

import json
import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 - register existing migrated tables, never create_all
from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Ai.adapters.business_tools import BusinessTools
from app.Domains.Ai.DTO.conversation import CreateConversation, ProposalDecision
from app.Domains.Ai.repositories.conversation_repository import ConversationRepository
from app.Domains.Ai.services.conversation_service import ConversationService
from app.Domains.Catalogs.models import Product, Supplier, Warehouse
from app.Domains.Integrations1C.models import IntegrationSource
from app.Domains.Inventory.models import InboundShipment, InventorySnapshot
from app.Domains.Procurement.models.order import Order, OrderAudit, OrderDelivery, OrderLine
from app.Domains.Replenishment.models.calculation import CalculationRun, Recommendation
from app.Domains.Users.models.user import User

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")


def synthetic_details():
    return {
        "breakdown": {
            "lead_time_days": 7,
            "review_days": 7,
            "horizon_days": 14,
            "safety_days": 7,
            "forecast_quantity": "40",
            "safety_stock": "10",
            "available_stock": "35",
            "inbound_quantity": "2.5",
            "unrounded_quantity": "12.5",
            "rounding_increment": "0",
            "recommended_quantity": "12.5",
            "lost_demand": "0",
            "baseline_daily": "2",
            "trend_daily_slope": "0",
            "seasonality_method": "flat_short_history",
            "shortage_date": None,
            "excess_quantity": "0",
            "raw_sales": "100",
            "corrected_sales": "100",
            "excluded_quantity": "0",
        },
        "warnings": ["synthetic_test_only"],
        "forecast": [],
        "history": [
            {"date": str(date.today()), "raw": "100", "corrected": "10", "stockout": False}
        ],
        "excluded_sales": [
            {
                "date": str(date.today()),
                "client_id": "DO_NOT_SEND_CUSTOMER",
                "quantity": "90",
                "threshold": "20",
                "reason": "test",
            }
        ],
        "inbound": [],
    }


@pytest.fixture
async def workspace():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            factory = async_sessionmaker(
                connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )
            try:
                async with factory() as session, session.begin():
                    actor = User(first_name="Agent business rollback QA", roles=[], permissions=[])
                    source = IntegrationSource(
                        name="Agent synthetic source", revision=1, complete=True
                    )
                    session.add_all([actor, source])
                    await session.flush()

                    def record(external_id):
                        return dict(
                            source_id=source.id,
                            external_id=external_id,
                            source_revision=1,
                            payload_hash="0" * 64,
                        )

                    warehouse = Warehouse(**record("warehouse"), name="Agent QA warehouse")
                    supplier = Supplier(**record("supplier"), name="Agent QA supplier")
                    session.add_all([warehouse, supplier])
                    await session.flush()
                    product = Product(
                        **record("product"),
                        sku=f"agent-qa-{uuid4()}",
                        code="00001",
                        name="Synthetic cable",
                        unit="м",
                        supplier_id=supplier.id,
                        lead_time_days=7,
                        pack_size=Decimal("0.5"),
                    )
                    session.add(product)
                    await session.flush()
                    stock = InventorySnapshot(
                        **record("stock"),
                        product_id=product.id,
                        warehouse_id=warehouse.id,
                        as_of=datetime.now(UTC) - timedelta(minutes=1),
                        quantity=Decimal("40"),
                        reserved=Decimal("5"),
                    )
                    inbound = InboundShipment(
                        **record("inbound"),
                        product_id=product.id,
                        warehouse_id=warehouse.id,
                        supplier_id=supplier.id,
                        document_id="PRIVATE_SOURCE_DOCUMENT",
                        expected_date=date.today() + timedelta(days=1),
                        quantity=Decimal("2.5"),
                        status="confirmed",
                    )
                    run = CalculationRun(
                        warehouse_id=warehouse.id,
                        as_of=date.today(),
                        created_by=actor.id,
                        idempotency_key=f"qa-{uuid4()}",
                        status="done",
                        algorithm_version="synthetic-test",
                        parameters={"history_days": 90},
                    )
                    session.add_all([stock, inbound, run])
                    await session.flush()
                    recommendation = Recommendation(
                        run_id=run.id,
                        product_id=product.id,
                        supplier_id=supplier.id,
                        warehouse_id=warehouse.id,
                        sku=product.sku,
                        name=product.name,
                        unit="м",
                        recommended_quantity=Decimal("12.5"),
                        status="ready",
                        urgency="normal",
                        explanation="Synthetic authoritative quantity",
                        details=synthetic_details(),
                    )
                    session.add(recommendation)
                    await session.flush()
                    permissions = {
                        "catalogs.read",
                        "inventory.read",
                        "replenishment.read",
                        "replenishment.run",
                        "orders.read",
                        "orders.write",
                        "imports.read",
                    }
                    principal = SimpleNamespace(
                        id=actor.id, has_permission=permissions.__contains__
                    )
                    tools = BusinessTools(session, principal)
                    repository = ConversationRepository(session)

                    def no_model():
                        raise AssertionError("This database integration must never invoke a model")

                    service = ConversationService(repository, actor.id, tools, no_model)
                    conversation = await service.create(CreateConversation())
                    yield SimpleNamespace(
                        session=session,
                        actor=actor,
                        source=source,
                        product=product,
                        warehouse=warehouse,
                        run=run,
                        recommendation=recommendation,
                        tools=tools,
                        repository=repository,
                        service=service,
                        conversation=conversation,
                        permissions=permissions,
                    )
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


async def orders_count(w):
    return await w.session.scalar(
        select(func.count(Order.id)).where(Order.created_by == w.actor.id)
    )


async def proposal(w):
    preview = await w.tools.prepare(
        "create_orders", {"recommendation_ids": [str(w.recommendation.id)]}
    )
    return await w.repository.add_proposal(w.conversation.id, preview)


async def test_real_stock_inbound_catalog_run_and_recommendation_contracts(workspace):
    w = workspace
    filters = {"warehouse_id": str(w.warehouse.id), "product_id": str(w.product.id)}
    stock = await w.tools.execute_read("get_stock", filters)
    assert len(stock["items"]) == 1
    assert Decimal(stock["items"][0]["quantity"]) == 40
    assert Decimal(stock["items"][0]["reserved"]) == 5
    inbound = await w.tools.execute_read("get_inbound", filters)
    assert Decimal(inbound["items"][0]["quantity"]) == Decimal("2.5")
    assert "PRIVATE_SOURCE_DOCUMENT" not in json.dumps(inbound)
    catalog = await w.tools.execute_read("search_catalog", {"query": w.product.sku})
    assert catalog["items"][0]["id"] == str(w.product.id)
    run = await w.tools.execute_read("get_run", {"id": str(w.run.id)})
    assert run["status"] == "done"
    rows = await w.tools.execute_read("list_recommendations", {"run_id": str(w.run.id)})
    assert rows["total"] == 1
    assert rows["items"][0]["id"] == str(w.recommendation.id)
    detail = await w.tools.execute_read("get_recommendation", {"id": str(w.recommendation.id)})
    assert Decimal(detail["breakdown"]["recommended_quantity"]) == Decimal("12.5")
    assert "history" not in detail and "excluded_sales" not in detail
    assert "DO_NOT_SEND_CUSTOMER" not in json.dumps(detail)
    overview = await w.tools.execute_read("get_overview", {"warehouse_id": str(w.warehouse.id)})
    assert overview["latest_run"]["id"] == str(w.run.id)
    assert overview["draft_order_count"] == 0


async def test_real_proposal_confirmation_creates_one_draft_and_retry_is_idempotent(workspace):
    w = workspace
    pending = await proposal(w)
    assert pending.id.version == 7
    assert Decimal(pending.preview["lines"][0]["quantity"]) == Decimal("12.5")
    assert await orders_count(w) == 0
    decision = ProposalDecision(expected_version=1, decision="confirm")
    result = await w.service.decide(w.conversation.id, pending.id, decision)
    assert result.proposals[0].status == "confirmed"
    assert result.proposals[0].version == 2
    assert await orders_count(w) == 1
    order = await w.session.scalar(select(Order).where(Order.created_by == w.actor.id))
    assert order.status == "draft" and order.approved_at is None and order.approved_by is None
    assert order.supplier_id == w.recommendation.supplier_id
    line = await w.session.scalar(select(OrderLine).where(OrderLine.order_id == order.id))
    assert line.quantity == Decimal("12.5") and line.product_id == w.product.id
    assert not await w.session.scalar(
        select(OrderDelivery).where(OrderDelivery.order_id == order.id)
    )
    audits = list(
        await w.session.scalars(select(OrderAudit).where(OrderAudit.order_id == order.id))
    )
    assert [entry.action for entry in audits] == ["created"]
    replay = await w.service.decide(w.conversation.id, pending.id, decision)
    assert replay.proposals[0].result == result.proposals[0].result
    assert await orders_count(w) == 1
    summary = await w.tools.execute_read("get_order", {"id": str(order.id)})
    assert summary["status"] == "draft" and summary["line_count"] == 1
    assert Decimal(summary["lines"][0]["quantity"]) == Decimal("12.5")


async def test_real_confirmation_rechecks_revoked_permission_and_preserves_pending(workspace):
    w = workspace
    pending = await proposal(w)
    w.permissions.remove("orders.write")
    with pytest.raises(DomainError) as error:
        await w.service.decide(
            w.conversation.id, pending.id, ProposalDecision(expected_version=1, decision="confirm")
        )
    assert error.value.status_code == 403
    assert pending.status == "pending" and pending.version == 1
    assert await orders_count(w) == 0
    w.permissions.remove("inventory.read")
    with pytest.raises(DomainError) as error:
        await w.tools.execute_read("get_stock", {"warehouse_id": str(w.warehouse.id)})
    assert error.value.status_code == 403
