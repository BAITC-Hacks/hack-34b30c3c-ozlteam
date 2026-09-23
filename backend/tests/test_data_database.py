import os
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Catalogs.models import Category, Product, Warehouse
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.services.exchange_service import ExchangeService
from app.Domains.DataImports.services.import_service import ImportService
from app.Domains.Integrations1C.DTO.exchange import ExchangeCommand
from app.Domains.Inventory.services.inventory_service import get_snapshot
from app.Domains.Users.models import User

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="Set RUN_DB_TESTS=1")


@pytest.fixture
async def data_session():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            await session.begin()
            try:
                yield session
            finally:
                await session.rollback()
    finally:
        await engine.dispose()


async def setup_source(session):
    user = User(first_name="Data test")
    session.add(user)
    await session.flush()
    repository = DataRepository(session)
    source = await repository.create_source(name="Test data", system="1c")
    return user, source, repository


async def test_exchange_atomic_rollback_uuid7_replay_and_snapshot(data_session):
    user, source, repository = await setup_source(data_session)
    assert source.id.version == 7
    service = ExchangeService(repository)
    command = ExchangeCommand(
        batch_key="initial",
        expected_revision=0,
        complete=True,
        rows=[
            dict(
                kind="products",
                external_id="p1",
                revision=1,
                name="Cable",
                sku="0001",
                unit="m",
                category_external_id="c1",
                supplier_external_id="s1",
                lead_time_days=10,
            ),
            dict(kind="categories", external_id="c1", revision=1, name="Cables"),
            dict(kind="suppliers", external_id="s1", revision=1, name="Supplier"),
            dict(kind="warehouses", external_id="w1", revision=1, name="Warehouse"),
            dict(
                kind="sales",
                external_id="sale1",
                revision=1,
                product_external_id="p1",
                warehouse_external_id="w1",
                date="2026-09-01",
                document_id="d1",
                line_id="1",
                quantity="10",
            ),
            dict(
                kind="stocks",
                external_id="stock1",
                revision=1,
                product_external_id="p1",
                warehouse_external_id="w1",
                as_of="2026-09-02T00:00:00Z",
                quantity="7",
                reserved="2",
            ),
        ],
    )
    batch = await service.apply(source.id, command, user.id)
    assert (await service.apply(source.id, command, user.id)).id == batch.id
    product = await data_session.scalar(select(Product).where(Product.source_id == source.id))
    warehouse = await data_session.scalar(select(Warehouse).where(Warehouse.source_id == source.id))
    assert product.id.version == 7
    snapshot = await get_snapshot(data_session, warehouse.id, None, date(2026, 9, 2))
    assert snapshot["products"][0]["sku"] == "0001"
    assert snapshot["sales"][0]["client_id"] is None
    assert snapshot["stocks"][0]["quantity"] == "7.000000"
    assert snapshot["source_versions"][0]["revision"] == 1
    with pytest.raises(DomainError) as missing_category:
        await get_snapshot(data_session, warehouse.id, uuid4(), date(2026, 9, 2))
    assert missing_category.value.code == "category_not_found"
    duplicate = ExchangeCommand(
        batch_key="duplicate-sale",
        expected_revision=1,
        complete=True,
        rows=[
            dict(
                kind="sales",
                external_id="new-id",
                revision=1,
                product_external_id="p1",
                warehouse_external_id="w1",
                date="2026-09-01",
                document_id="d1",
                line_id="1",
                quantity="10",
            )
        ],
    )
    with pytest.raises(DomainError) as duplicate_error:
        async with data_session.begin_nested():
            await service.apply(source.id, duplicate, user.id)
    assert duplicate_error.value.code == "duplicate_accounting_fact"
    bad = ExchangeCommand(
        batch_key="bad",
        expected_revision=1,
        complete=True,
        rows=[
            dict(kind="categories", external_id="new", revision=1, name="Must roll back"),
            dict(
                kind="products",
                external_id="bad",
                revision=1,
                name="Bad",
                sku="B",
                unit="m",
                category_external_id="missing",
            ),
        ],
    )
    with pytest.raises(DomainError):
        async with data_session.begin_nested():
            await service.apply(source.id, bad, user.id)
    assert (
        await data_session.scalar(
            select(func.count())
            .select_from(Category)
            .where(Category.source_id == source.id, Category.external_id == "new")
        )
        == 0
    )


async def test_import_invalid_stage_and_apply_idempotency(data_session):
    user, source, repository = await setup_source(data_session)
    service = ImportService(repository)
    invalid = await service.stage(
        source.id,
        "bad.csv",
        b"external_id,revision,name\nc1,wrong,Cables\n",
        "categories",
        {},
        1,
        user.id,
    )
    assert invalid.status == "invalid"
    with pytest.raises(DomainError):
        await service.apply(invalid.id, user.id)
    valid = await service.stage(
        source.id,
        "valid.csv",
        b"external_id,revision,name\nc1,1,Cables\n",
        "categories",
        {},
        1,
        user.id,
    )
    applied = await service.apply(valid.id, user.id, True)
    assert applied.status == "applied"
    assert (await service.apply(valid.id, user.id, True)).id == applied.id
    assert (
        await data_session.scalar(
            select(func.count()).select_from(Category).where(Category.source_id == source.id)
        )
        == 1
    )


async def test_growth_conflict_and_cancellation_changes_snapshot(data_session):
    user, source, repository = await setup_source(data_session)
    service = ExchangeService(repository)
    growth = dict(
        kind="growth",
        external_id="g1",
        revision=1,
        category_external_id="c1",
        start="2026-01-01",
        end="2026-12-31",
        rate="0.1",
    )
    stockout = dict(
        kind="stockouts",
        external_id="so1",
        revision=1,
        product_external_id="p1",
        warehouse_external_id="w1",
        start="2026-08-01",
        end="2026-08-03",
    )
    initial = ExchangeCommand(
        batch_key="initial",
        expected_revision=0,
        complete=True,
        rows=[
            dict(kind="categories", external_id="c1", revision=1, name="Cables"),
            dict(kind="warehouses", external_id="w1", revision=1, name="Warehouse"),
            dict(
                kind="products",
                external_id="p1",
                revision=1,
                name="Cable",
                sku="C",
                unit="m",
                category_external_id="c1",
            ),
            growth,
            stockout,
        ],
    )
    await service.apply(source.id, initial, user.id)
    warehouse = await data_session.scalar(select(Warehouse).where(Warehouse.source_id == source.id))
    before = await get_snapshot(data_session, warehouse.id, None, date(2026, 9, 2))
    assert len(before["growth"]) == len(before["stockouts"]) == 1
    overlap = ExchangeCommand(
        batch_key="overlap",
        expected_revision=1,
        complete=True,
        rows=[
            dict(
                kind="growth",
                external_id="g2",
                revision=1,
                category_external_id="c1",
                start="2026-05-01",
                end="2026-12-31",
                rate="0.3",
            ),
        ],
    )
    with pytest.raises(DomainError) as error:
        async with data_session.begin_nested():
            await service.apply(source.id, overlap, user.id)
    assert error.value.code == "duplicate_accounting_fact"
    cancellation = ExchangeCommand(
        batch_key="cancel",
        expected_revision=1,
        complete=True,
        rows=[
            {**growth, "revision": 2, "active": False},
            {**stockout, "revision": 2, "active": False},
        ],
    )
    await service.apply(source.id, cancellation, user.id)
    after = await get_snapshot(data_session, warehouse.id, None, date(2026, 9, 2))
    assert after["growth"] == after["stockouts"] == []
