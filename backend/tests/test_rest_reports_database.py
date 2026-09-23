import os

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.Domains.Catalogs.models import Category
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.services.import_service import ImportService
from app.Domains.Integrations1C.DTO.reports import SaveReport
from app.Domains.Integrations1C.repositories.report_repository import ReportRepository
from app.Domains.Integrations1C.services.report_service import ReportService
from app.Domains.Users.models import User

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="Set RUN_DB_TESTS=1")


async def test_rest_profile_persists_preview_does_not_apply_and_replay_preserves_uuid():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            await session.begin()
            try:
                user = User(first_name="REST integration test")
                session.add(user)
                await session.flush()
                user_id = user.id
                data = DataRepository(session)
                source = await data.create_source(name="REST test", system="1c")
                imports = ImportService(data)
                repository = ReportRepository(session)
                transport = httpx.MockTransport(
                    lambda request: httpx.Response(
                        200,
                        json={
                            "value": [
                                {
                                    "Ref_Key": "000123_",
                                    "Version": 1,
                                    "Description": "Кабели",
                                    "Private": "DO_NOT_STORE",
                                }
                            ],
                        },
                    )
                )
                service = ReportService(repository, imports, "https://one-c.example", transport)
                command = SaveReport(
                    name="Категории",
                    kind="categories",
                    url="https://one-c.example/categories",
                    items_path="value",
                    column_mapping={
                        "Ref_Key": "external_id",
                        "Version": "revision",
                        "Description": "name",
                    },
                )
                report = await service.create(source.id, command)
                assert report.id.version == 7
                session.expire_all()
                reports = await service.list(report.source_id)
                assert reports[0].column_mapping == command.column_mapping
                report = await service.update(
                    report.id, command.model_copy(update={"name": "Updated"})
                )
                assert report.name == "Updated"
                staged = await service.preview(report.id, user_id)
                assert staged.status == "validated"
                stored = await data.get_import(staged.id)
                assert "DO_NOT_STORE" not in str(stored.rows)
                assert not list(
                    await session.scalars(
                        select(Category).where(Category.source_id == report.source_id)
                    )
                )
                applied = await imports.apply(staged.id, user_id, complete=True)
                assert applied.status == "applied"
                category = await session.scalar(
                    select(Category).where(Category.source_id == report.source_id)
                )
                identity = category.id
                assert category.external_id == "000123_" and identity.version == 7
                repeated = await service.preview(report.id, user_id)
                assert repeated.status == "validated"
                await imports.apply(repeated.id, user_id, complete=True)
                categories = list(
                    await session.scalars(
                        select(Category).where(Category.source_id == report.source_id)
                    )
                )
                assert [row.id for row in categories] == [identity]
            finally:
                await session.rollback()
    finally:
        await engine.dispose()
