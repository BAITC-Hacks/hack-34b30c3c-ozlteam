"""Package checkpoints and identity guards, in an outer rolled-back transaction."""

import hashlib
import os
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Catalogs.models import Product
from app.Domains.DataImports import tasks
from app.Domains.DataImports.DTO.packages import PackageOptions
from app.Domains.DataImports.models.packages import ImportIdentity
from app.Domains.DataImports.repositories.package_repository import PackageRepository
from app.Domains.DataImports.services import package_service
from app.Domains.DataImports.services.package_service import PackageService
from app.Domains.Files.adapters.local_storage import LocalFileStorage
from app.Domains.Inventory.models import Sale
from app.Domains.Jobs import dependencies as job_dependencies
from app.Domains.Jobs.repositories.job_repository import SqlAlchemyJobRepository
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Users.models import User

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")


async def test_package_resume_duplicate_and_changed_dynamics_guard(monkeypatch, tmp_path):
    monkeypatch.setattr(package_service, "DEFAULT_SOURCE_NAME", "Package rollback test")
    engine = create_async_engine(get_settings().database_url)
    storage = LocalFileStorage(tmp_path)
    rows = [
        dict(kind="suppliers", external_id="supplier", revision=1, name="IEK"),
        dict(kind="warehouses", external_id="warehouse", revision=1, name="EKT"),
        dict(
            kind="products",
            external_id="product",
            revision=1,
            code="001_",
            sku="ART",
            name="Cable",
            unit="м",
            supplier_external_id="supplier",
            lead_time_days=7,
        ),
    ] + [
        dict(
            kind="sales",
            external_id=f"sale-{i}",
            revision=1,
            product_external_id="product",
            warehouse_external_id="warehouse",
            document_id=f"doc-{i}",
            line_id="1",
            date=date(2026, 9, 1).isoformat(),
            quantity="2",
        )
        for i in range(1005)
    ]

    def parser(files, options):
        return dict(
            rows=rows,
            products=[],
            issues=[],
            controls=[{"kind": "test"}],
            files=[
                {
                    "filename": "Динамика_IEK.xlsx",
                    "profile": "iek.dynamics",
                    "sha256": hashlib.sha256(files[0][1]).hexdigest(),
                }
            ],
            summary={"products": 1},
        )

    monkeypatch.setattr(tasks, "parse_partner_files", parser)
    monkeypatch.setattr(tasks, "get_file_storage", lambda: storage)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        factory = async_sessionmaker(
            connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        monkeypatch.setattr(tasks, "session_factory", factory)
        monkeypatch.setattr(job_dependencies, "session_factory", factory)

        def service(session):
            return PackageService(
                PackageRepository(session),
                storage,
                JobService(SqlAlchemyJobRepository(session), None),
            )

        try:
            async with factory() as session, session.begin():
                actor = User(first_name="Package QA", roles=[], permissions=[])
                session.add(actor)
                await session.flush()
                actor_id = actor.id
                original = await service(session).stage(
                    [("Динамика_IEK.xlsx", b"fixture")],
                    PackageOptions(),
                    None,
                    "Package rollback test",
                    actor_id,
                )
                assert original.id.version == 7
                explicit = await service(session).stage(
                    [("Динамика_IEK.xlsx", b"fixture")],
                    PackageOptions(),
                    original.source_id,
                    "Different package label",
                    actor_id,
                )
                assert explicit.id == original.id
                assert explicit.job_id == original.job_id
            await tasks.parse_import_package({}, str(original.job_id), str(original.id))
            async with factory() as session, session.begin():
                staged = await service(session).get(original.id)
                assert staged.status == "validated", staged.error
                command = await service(session).apply(original.id, actor_id)
                assert not (await PackageRepository(session).source(original.source_id)).complete
            real_bulk = PackageRepository.bulk_exchange
            calls = 0

            async def interrupted_bulk(self, source, command, user_id):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise DomainError("Имитируем прерывание после первой порции")
                return await real_bulk(self, source, command, user_id)

            monkeypatch.setattr(PackageRepository, "bulk_exchange", interrupted_bulk)
            await tasks.apply_import_package({}, str(command.job_id), str(original.id))
            async with factory() as session, session.begin():
                item = await service(session).get(original.id)
                assert item.status == "failed"
                assert item.processed_rows == 1000
                assert not (await PackageRepository(session).source(original.source_id)).complete
                retry = await service(session).retry(original.id, actor_id)
            monkeypatch.setattr(PackageRepository, "bulk_exchange", real_bulk)
            await tasks.apply_import_package({}, str(retry.job_id), str(original.id))
            async with factory() as session, session.begin():
                item = await service(session).get(original.id)
                assert item.status == "applied", item.error
                assert item.processed_rows == 1008
                assert (await PackageRepository(session).source(original.source_id)).complete
                count = await session.scalar(
                    select(func.count())
                    .select_from(Sale)
                    .where(Sale.source_id == original.source_id)
                )
                assert count == 1005
                product_id = await session.scalar(
                    select(Product.id).where(Product.source_id == original.source_id)
                )
                assert (
                    await session.scalar(
                        select(ImportIdentity.product_id).where(
                            ImportIdentity.source_id == original.source_id
                        )
                    )
                    == product_id
                )
                duplicate = await service(session).stage(
                    [("Динамика_IEK.xlsx", b"fixture")],
                    PackageOptions(),
                    None,
                    "Package rollback test",
                    actor_id,
                )
                assert duplicate.id == original.id
                altered = SimpleNamespace(
                    id=uuid4(),
                    source_id=item.source_id,
                    files=item.files,
                    options=item.options | {"warehouse_mapping": {"iek.inbound": "Other"}},
                )
                with pytest.raises(DomainError, match="настроек учётных фактов"):
                    await PackageRepository(session).guard_fact_replacement(altered)
                changed = await service(session).stage(
                    [("Динамика_IEK.xlsx", b"changed")],
                    PackageOptions(revision=2),
                    None,
                    "Package rollback test",
                    actor_id,
                )
                assert changed.source_id == original.source_id
            await tasks.parse_import_package({}, str(changed.job_id), str(changed.id))
            async with factory() as session, session.begin():
                with pytest.raises(DomainError, match="другой версии книги"):
                    await service(session).apply(changed.id, actor_id)
                assert (await PackageRepository(session).source(original.source_id)).complete
        finally:
            await transaction.rollback()
    await engine.dispose()
