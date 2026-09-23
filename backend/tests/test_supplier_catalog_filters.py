"""Catalog filter contract, plus opt-in PostgreSQL semantics with rolled-back fixtures."""

import os
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import get_settings
from app.Domains.Catalogs.controllers.http import get_service
from app.Domains.Catalogs.models import Product, Supplier
from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
from app.Domains.Catalogs.services.catalog_service import CatalogService
from app.Domains.Integrations1C.models import IntegrationSource
from app.Domains.Security.dependencies import get_current_user
from app.Domains.Users.models.user import Permission, User
from app.main import app


@pytest.fixture
def catalog_client_dependencies():
    repository = AsyncMock()
    repository.list.return_value = []
    service = CatalogService(repository, AsyncMock())
    user = User(
        id=uuid4(),
        first_name="Проверка справочника",
        roles=[],
        permissions=[Permission(code="catalogs.read", name="Справочники")],
    )
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_service] = lambda: service
    try:
        yield repository
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)


def test_openapi_exposes_optional_uuid_source_and_supplier_filters():
    operation = app.openapi()["paths"]["/api/v1/catalogs/{kind}"]["get"]
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    for name in ("source_id", "supplier_id"):
        parameter = parameters[name]
        assert parameter["in"] == "query"
        assert not parameter.get("required", False)
        alternatives = parameter["schema"].get("anyOf", [parameter["schema"]])
        assert any(value.get("format") == "uuid" for value in alternatives)
    assert "422" in operation["responses"]


async def test_product_filters_reach_repository_as_uuids(catalog_client_dependencies):
    source_id, supplier_id = uuid4(), uuid4()
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/catalogs/products",
            params={
                "source_id": str(source_id),
                "supplier_id": str(supplier_id),
                "q": "0001_50%",
                "active": "true",
                "limit": 10,
                "offset": 20,
            },
        )
    assert response.status_code == 200, response.text
    assert response.json() == []
    catalog_client_dependencies.list.assert_awaited_once_with(
        "products", 10, 20, "0001_50%", True, source_id, supplier_id
    )


@pytest.mark.parametrize("kind", ["suppliers", "categories", "warehouses"])
async def test_nonproduct_supplier_filter_is_rejected_before_query(
    kind, catalog_client_dependencies
):
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get(
            f"/api/v1/catalogs/{kind}", params={"supplier_id": str(uuid4())}
        )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_catalog_filter"
    catalog_client_dependencies.list.assert_not_awaited()


@pytest.mark.parametrize("parameter", ["source_id", "supplier_id"])
async def test_malformed_filter_uuid_is_rejected(parameter, catalog_client_dependencies):
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        response = await client.get("/api/v1/catalogs/products", params={parameter: "not-a-uuid"})
    assert response.status_code == 422, response.text
    catalog_client_dependencies.list.assert_not_awaited()


@pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")
async def test_postgres_combines_source_supplier_and_literal_code_search():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                async with AsyncSession(connection, expire_on_commit=False) as session:
                    sources = [IntegrationSource(name=f"Фильтры {uuid4()}") for _ in range(2)]
                    session.add_all(sources)
                    await session.flush()
                    suppliers = [
                        Supplier(
                            source_id=source.id,
                            external_id=f"supplier-{index}",
                            source_revision=1,
                            payload_hash="0" * 64,
                            name=f"Поставщик {index}",
                        )
                        for index, source in enumerate((sources[0], sources[0], sources[1]))
                    ]
                    session.add_all(suppliers)
                    await session.flush()

                    def product(index, source, supplier, code, active=True):
                        return Product(
                            source_id=source.id,
                            external_id=f"product-{index}",
                            source_revision=1,
                            payload_hash="0" * 64,
                            supplier_id=supplier.id,
                            name=f"Позиция {index}",
                            sku=f"SKU-{index}",
                            code=code,
                            unit="шт",
                            active=active,
                        )

                    products = [
                        product(0, sources[0], suppliers[0], "0001_50%"),
                        product(1, sources[0], suppliers[0], "0001X50Z"),
                        product(2, sources[0], suppliers[1], "0001_50%"),
                        product(3, sources[1], suppliers[2], "0001_50%"),
                        product(4, sources[0], suppliers[0], "0001_50%", active=False),
                    ]
                    session.add_all(products)
                    await session.flush()
                    repository = CatalogRepository(session)
                    filtered = await repository.list(
                        "products",
                        query="0001_50%",
                        active=True,
                        source_id=sources[0].id,
                        supplier_id=suppliers[0].id,
                    )
                    assert [p.id for p in filtered] == [products[0].id]
                    supplier_scope = await repository.list(
                        "products", source_id=sources[0].id, supplier_id=suppliers[1].id
                    )
                    assert [p.id for p in supplier_scope] == [products[2].id]
                    other_source = await repository.list("products", source_id=sources[1].id)
                    assert [p.id for p in other_source] == [products[3].id]
            finally:
                if transaction.is_active:
                    await transaction.rollback()
    finally:
        await engine.dispose()
