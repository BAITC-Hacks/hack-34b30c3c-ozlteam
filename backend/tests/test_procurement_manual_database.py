"""Exercise manual draft persistence and the real catalog adapter in a rolled-back transaction."""

import os
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.errors import DomainError
from app.Domains.Catalogs.models import Product, Supplier, Warehouse
from app.Domains.Integrations1C.models import IntegrationSource
from app.Domains.Procurement.adapters.source import OrderSource
from app.Domains.Procurement.DTO.order import CreateSupplierDraft, DeleteOrder, VersionCommand
from app.Domains.Procurement.repositories.order_repository import OrderRepository
from app.Domains.Procurement.services.order_service import OrderService
from app.Domains.Users.models.user import User

pytestmark = pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="opt-in PostgreSQL")


async def test_real_catalog_manual_draft_delete_and_approval():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                async with AsyncSession(connection, expire_on_commit=False) as session:
                    source = IntegrationSource(name=f"Manual drafts test {uuid4()}")
                    user = User(first_name="Manual draft test")
                    session.add_all([source, user])
                    await session.flush()
                    common = dict(source_id=source.id, source_revision=1, payload_hash="0" * 64)
                    supplier = Supplier(**common, external_id="supplier", name="Supplier")
                    other = Supplier(**common, external_id="other", name="Other supplier")
                    warehouse = Warehouse(**common, external_id="warehouse", name="Warehouse")
                    session.add_all([supplier, other, warehouse])
                    await session.flush()
                    product = Product(
                        **common,
                        external_id="product",
                        name="Product",
                        sku="SKU-1",
                        code="001",
                        unit="шт",
                        supplier_id=supplier.id,
                    )
                    session.add(product)
                    await session.flush()
                    repository = OrderRepository(session)
                    service = OrderService(repository, OrderSource(session))
                    command = CreateSupplierDraft(
                        supplier_id=supplier.id,
                        warehouse_id=warehouse.id,
                        lines=[{"product_id": product.id, "quantity": "2.125"}],
                        idempotency_key=f"manual-db-{uuid4()}",
                    )
                    preview = await service.preview_supplier_draft(command)
                    assert preview["lines"][0]["code"] == "001"
                    with pytest.raises(DomainError) as error:
                        await service.preview_supplier_draft(
                            command.model_copy(update={"supplier_id": other.id})
                        )
                    assert error.value.code == "product_supplier_mismatch"
                    before = await repository.count_drafts(warehouse.id)
                    order = await service.create_supplier_draft(command, user.id)
                    assert order.id.version == 7 and order.lines[0].id.version == 7
                    assert order.lines[0].recommended_quantity is None
                    assert order.external_references.products[0].external_id == "product"
                    assert (await service.create_supplier_draft(command, user.id)).id == order.id
                    assert await repository.count_drafts(warehouse.id) == before + 1
                    await service.delete(
                        order.id, DeleteOrder(expected_version=1, reason="Test removal"), user.id
                    )
                    assert await repository.count_drafts(warehouse.id) == before
                    assert await service.list(warehouse_id=warehouse.id) == []
                    with pytest.raises(DomainError) as error:
                        await service.get(order.id)
                    assert error.value.status_code == 404
                    with pytest.raises(DomainError) as error:
                        await service.create_supplier_draft(command, user.id)
                    assert error.value.code == "order_deleted"
                    assert (await service.audits(order.id))[0].action == "deleted"
                    replacement = await service.create_supplier_draft(
                        command.model_copy(update={"idempotency_key": f"manual-db-{uuid4()}"}),
                        user.id,
                    )
                    approved = await service.approve(
                        replacement.id, VersionCommand(expected_version=1), user.id
                    )
                    assert approved.status == "approved"
                    assert (await service.handoff(approved.id)).order.lines[
                        0
                    ].recommended_quantity is None
                    assert (await service.export(approved.id, "csv")).startswith(b"\xef\xbb\xbf")
            finally:
                if transaction.is_active:
                    await transaction.rollback()
    finally:
        await engine.dispose()
