import asyncio
import os
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 - shared metadata registration
from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Procurement.DTO.order import (
    Acknowledge,
    CreateOrders,
    EditLine,
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
from app.Domains.Procurement.repositories.order_repository import OrderRepository
from app.Domains.Procurement.services.order_service import OrderService
from app.Domains.Users.models.user import User

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1",
    reason="Set RUN_DB_TESTS=1 after applying migrations",
)


class PersistedTestSource:
    def __init__(self):
        self.row = dict(
            id=uuid4(),
            run_id=uuid4(),
            product_id=uuid4(),
            supplier_id=uuid4(),
            warehouse_id=uuid4(),
            sku="TEST",
            name="Test product",
            unit="м",
            recommended_quantity=Decimal("15.123456"),
        )

    async def recommendations(self, ids):
        return [self.row]

    async def suppliers(self, ids):
        return [dict(id=self.row["supplier_id"], name="Test supplier")]

    async def references(self, product_ids, supplier_id, warehouse_id):
        def reference(identifier):
            return dict(
                id=identifier,
                source_id=supplier_id,
                external_id=f"external:{identifier}",
                name="Test external",
            )

        return dict(
            supplier=reference(supplier_id),
            warehouse=reference(warehouse_id),
            products=[
                dict(**reference(identifier), sku="TEST", unit="м") for identifier in product_ids
            ],
        )


async def test_database_concurrent_allocation_version_and_approved_snapshot():
    engine = create_async_engine(get_settings().database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    source = PersistedTestSource()
    prefix = f"procurement-test-{uuid4()}"
    user_id = None

    async def create(key):
        async with sessions() as session, session.begin():
            return await OrderService(OrderRepository(session), source).create(
                CreateOrders(
                    recommendation_ids=[source.row["id"]],
                    idempotency_key=f"{prefix}-{key}",
                ),
                user_id,
            )

    try:
        async with sessions() as session, session.begin():
            user = User(first_name="Procurement integration test")
            session.add(user)
            await session.flush()
            user_id = user.id
        # Two requests with the SAME key serialize and return the identical order.
        first, repeat = await asyncio.gather(create("one"), create("one"))
        order = first[0]
        assert order.id == repeat[0].id
        assert order.id.version == 7
        # A new key cannot allocate the same recommendation a second time.
        with pytest.raises(DomainError):
            await create("two")

        async def edit(quantity):
            async with sessions() as session, session.begin():
                return await OrderService(OrderRepository(session), source).edit_line(
                    order.id,
                    order.lines[0].id,
                    EditLine(expected_version=1, quantity=quantity, reason="Concurrent test"),
                    user_id,
                )

        results = await asyncio.gather(edit("4.123456"), edit("7.987654"), return_exceptions=True)
        assert sum(isinstance(result, DomainError) for result in results) == 1
        async with sessions() as session, session.begin():
            service = OrderService(OrderRepository(session), source)
            latest = await service.get(order.id)
            assert latest.version == 2
            approved = await service.approve(order.id, VersionCommand(expected_version=2), user_id)
        async with sessions() as session:
            service = OrderService(OrderRepository(session), source)
            assert await service.get(order.id) == approved
            assert (await service.handoff(order.id)).delivery.status == "pending"
            assert len(await service.audits(order.id)) == 3
        async with sessions() as session, session.begin():
            service = OrderService(OrderRepository(session), source)
            await service.acknowledge(
                order.id,
                Acknowledge(
                    revision=1,
                    status="rejected",
                    message="Test rejection",
                ),
                user_id,
            )

        async def revise():
            async with sessions() as session, session.begin():
                return await OrderService(OrderRepository(session), source).revise(
                    order.id,
                    ReviseOrder(expected_version=approved.version, reason="Test revision"),
                    user_id,
                )

        revised, retried = await asyncio.gather(revise(), revise())
        assert revised.id == retried.id and revised.id != order.id
        assert revised.revision == 2 and revised.supersedes_order_id == order.id
        async with sessions() as session, session.begin():
            service = OrderService(OrderRepository(session), source)
            assert await service.get(order.id) == approved
            assert len(await service.repository.allocations([source.row["id"]])) == 1
            with pytest.raises(DomainError):
                await service.acknowledge(
                    order.id,
                    Acknowledge(
                        revision=1,
                        status="accepted",
                        external_document_id="late",
                    ),
                    user_id,
                )
    finally:
        if user_id is not None:
            async with sessions() as session, session.begin():
                order_ids = select(Order.id).where(Order.created_by == user_id)
                for model in (OrderAllocation, OrderAudit, OrderDelivery, OrderLine):
                    await session.execute(delete(model).where(model.order_id.in_(order_ids)))
                await session.execute(
                    delete(OrderCreation).where(OrderCreation.idempotency_key.like(f"{prefix}%"))
                )
                await session.execute(delete(Order).where(Order.created_by == user_id))
                await session.execute(delete(User).where(User.id == user_id))
        await engine.dispose()
