"""A date-only EKT stock snapshot must retain its local calendar day in UTC storage."""

import os
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import get_settings
from app.Domains.Catalogs.models import Product, Warehouse
from app.Domains.Integrations1C.models import IntegrationSource
from app.Domains.Inventory.models import InventorySnapshot
from app.Domains.Inventory.repositories.inventory_repository import InventoryRepository
from app.Domains.Inventory.services.inventory_service import InventoryService


@pytest.mark.parametrize(
    ("stored_at", "expected_day"),
    [
        (datetime(2026, 9, 21, 19, tzinfo=UTC), "2026-09-22"),
        (datetime(2026, 9, 22, 18, 59, 59, tzinfo=UTC), "2026-09-22"),
    ],
)
async def test_snapshot_keeps_local_stock_date_after_utc_roundtrip(stored_at, expected_day):
    source_id, warehouse_id, product_id = uuid4(), uuid4(), uuid4()
    repository = AsyncMock()
    source = SimpleNamespace(id=source_id, complete=True, revision=1, cursor=None, synced_at=None)
    warehouse = SimpleNamespace(id=warehouse_id, source_id=source_id, active=True)
    stock = SimpleNamespace(
        product_id=product_id, as_of=stored_at, quantity=Decimal(20), reserved=Decimal(3)
    )
    repository.snapshot_records.return_value = ([source], warehouse, [], [], [stock], [], [], [])
    snapshot = await InventoryService(repository).snapshot(warehouse_id, None, date(2026, 9, 22))
    assert snapshot["stocks"] == [
        {"product_id": str(product_id), "as_of": expected_day, "quantity": "20", "reserved": "3"}
    ]


async def test_repository_cutoff_excludes_next_local_day_before_utc_midnight():
    source_id, warehouse_id = uuid4(), uuid4()
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(id=warehouse_id, source_id=source_id)
    session.execute.return_value = Mock(all=lambda: [])
    session.scalars.side_effect = [[], [], [], [], [], []]
    await InventoryRepository(session).snapshot_records(warehouse_id, None, date(2026, 9, 22))
    stock_query = session.scalars.await_args_list[2].args[0]
    cutoffs = [
        value for value in stock_query.compile().params.values() if isinstance(value, datetime)
    ]
    assert len(cutoffs) == 1
    cutoff = cutoffs[0]
    assert cutoff.astimezone(UTC) == datetime(2026, 9, 22, 19, tzinfo=UTC)
    assert datetime(2026, 9, 22, 18, 59, 59, tzinfo=UTC) < cutoff
    # 20:00 UTC is already 01:00 tomorrow in Алматы, not an eligible same-day stock.
    assert not datetime(2026, 9, 22, 20, tzinfo=UTC) < cutoff


@pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")
async def test_postgres_stock_snapshot_excludes_next_local_day():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                async with AsyncSession(connection, expire_on_commit=False) as session:
                    source = IntegrationSource(name="Проверка календарной даты", complete=True)
                    session.add(source)
                    await session.flush()
                    shared = dict(source_id=source.id, source_revision=1, payload_hash="0" * 64)
                    product = Product(**shared, external_id="p", name="Товар", sku="s", unit="шт")
                    warehouse = Warehouse(**shared, external_id="w", name="Алматы")
                    session.add_all([product, warehouse])
                    await session.flush()
                    session.add_all(
                        [
                            InventorySnapshot(
                                **shared,
                                external_id=str(index),
                                product_id=product.id,
                                warehouse_id=warehouse.id,
                                as_of=stamp,
                                quantity=amount,
                                reserved=0,
                            )
                            for index, (stamp, amount) in enumerate(
                                [
                                    (datetime(2026, 9, 21, 19, tzinfo=UTC), 20),
                                    (datetime(2026, 9, 22, 20, tzinfo=UTC), 999),
                                ]
                            )
                        ]
                    )
                    await session.flush()
                    snapshot = await InventoryService(InventoryRepository(session)).snapshot(
                        warehouse.id, None, date(2026, 9, 22)
                    )
                    assert len(snapshot["stocks"]) == 1
                    assert Decimal(snapshot["stocks"][0]["quantity"]) == 20
                    assert snapshot["stocks"][0]["as_of"] == "2026-09-22"
            finally:
                if transaction.is_active:
                    await transaction.rollback()
    finally:
        await engine.dispose()
