"""Every record/source revision is isolated in an outer rolled-back transaction."""

import os
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Catalogs.DTO.manual import ManualCreate, ManualPatch
from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
from app.Domains.Catalogs.services.catalog_service import CatalogService
from app.Domains.DataImports.DTO.rows import SupplierRow
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.services.exchange_service import ExchangeService
from app.Domains.Integrations1C.DTO.exchange import CatalogCommand
from app.Domains.Integrations1C.models import ExchangeBatch, IntegrationSource
from app.Domains.Users.models.user import User

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")


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
                    user = User(first_name="Manual catalog QA", roles=[], permissions=[])
                    source = IntegrationSource(name=f"Manual QA {uuid4()}", complete=True)
                    session.add_all([user, source])
                    await session.flush()
                    repository = CatalogRepository(session)
                    service = CatalogService(repository, ExchangeService(DataRepository(session)))
                    yield SimpleNamespace(
                        session=session,
                        user=user,
                        source=source,
                        repository=repository,
                        service=service,
                    )
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


async def test_all_catalogs_create_edit_archive_restore_and_stale_guard(workspace):
    w = workspace
    created = {}
    for kind, extras in [
        ("suppliers", {}),
        ("warehouses", {"organization_external_id": "org"}),
        ("categories", {"review_days": 14, "safety_days": 3}),
        (
            "products",
            {
                "sku": "QA-CABLE",
                "unit": "м",
                "pack_size": "0.5",
                "min_order_qty": "2.5",
                "lead_time_days": 7,
            },
        ),
    ]:
        if kind == "products":
            extras.update(supplier_id=created["suppliers"].id, category_id=created["categories"].id)
        row = await w.service.save_manual(
            kind, ManualCreate(name=f"QA {kind}", source_id=w.source.id, **extras), w.user.id
        )
        assert row.id.version == 7 and row.external_id.startswith("local:")
        created[kind] = row
        edited = await w.service.save_manual(
            kind,
            ManualPatch(expected_updated_at=row.updated_at, name=f"Edited {kind}"),
            w.user.id,
            row.id,
        )
        assert edited.name == f"Edited {kind}"
        with pytest.raises(DomainError) as error:
            await w.service.save_manual(
                kind,
                ManualPatch(expected_updated_at=row.updated_at, active=False),
                w.user.id,
                row.id,
            )
        assert error.value.code == "stale_updated_at"
        archived = await w.service.save_manual(
            kind,
            ManualPatch(expected_updated_at=edited.updated_at, active=False),
            w.user.id,
            row.id,
        )
        assert not archived.active
        restored = await w.service.save_manual(
            kind,
            ManualPatch(expected_updated_at=archived.updated_at, active=True),
            w.user.id,
            row.id,
        )
        assert restored.active
        assert restored.source_id == row.source_id and restored.external_id == row.external_id
    audits = list(
        await w.session.scalars(select(ExchangeBatch).where(ExchangeBatch.source_id == w.source.id))
    )
    assert len(audits) == 16 and all(a.created_by == w.user.id for a in audits)
    assert audits[-1].summary["after"]["active"] is True
    assert (await w.service.get("products", created["products"].id)).data_quality[
        "status"
    ] == "limited"


async def test_import_identity_hash_replay_and_new_revision_override(workspace):
    w = workspace
    command = CatalogCommand(
        source_id=w.source.id,
        expected_revision=0,
        row=SupplierRow(external_id="1c-supplier", revision=1, name="From 1C"),
    )
    imported = await w.service.save("suppliers", command, w.user.id)
    record = await w.repository.get("suppliers", imported.id)
    identity = (record.source_id, record.external_id, record.source_revision, record.payload_hash)
    edited = await w.service.save_manual(
        "suppliers",
        ManualPatch(expected_updated_at=imported.updated_at, name="Local correction", active=False),
        w.user.id,
        imported.id,
    )
    assert not edited.active
    assert identity == (
        record.source_id,
        record.external_id,
        record.source_revision,
        record.payload_hash,
    )
    replay = await w.service.save("suppliers", command, w.user.id)
    assert replay.name == "Local correction" and not replay.active
    newer = CatalogCommand(
        source_id=w.source.id,
        expected_revision=w.source.revision,
        row=SupplierRow(external_id="1c-supplier", revision=2, name="New 1C"),
    )
    updated = await w.service.save("suppliers", newer, w.user.id)
    assert updated.id == imported.id and updated.name == "New 1C" and updated.active
    assert updated.source_revision == 2


async def test_reference_source_rules_and_manual_unknown_terms(workspace):
    w = workspace
    supplier = await w.service.save_manual(
        "suppliers", ManualCreate(name="Manual supplier"), w.user.id
    )
    with pytest.raises(DomainError) as error:
        await w.service.save_manual(
            "products",
            ManualCreate(
                source_id=w.source.id,
                name="Invalid cross-source",
                sku="x",
                unit="шт",
                supplier_id=supplier.id,
            ),
            w.user.id,
        )
    assert error.value.code == "catalog_reference_source_mismatch"
    product = await w.service.save_manual(
        "products",
        ManualCreate(name="Unknown terms", sku="x", unit="шт", supplier_id=supplier.id),
        w.user.id,
    )
    assert product.source_id == supplier.source_id
    assert product.data_quality["status"] == "blocked"
    confirmed = await w.service.save_manual(
        "products",
        ManualPatch(
            expected_updated_at=product.updated_at,
            pack_size="1",
            min_order_qty="0",
            lead_time_days=7,
        ),
        w.user.id,
        product.id,
    )
    assert confirmed.data_quality["status"] == "limited"
    assert confirmed.data_quality["unknown_terms"] == []
    with pytest.raises(DomainError) as error:
        await w.service.save_manual(
            "suppliers", ManualCreate(name="Wrong kind", sku="wrong"), w.user.id
        )
    assert error.value.status_code == 422
