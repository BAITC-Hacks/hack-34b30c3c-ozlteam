from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
from app.Domains.Catalogs.resources.catalog import RESOURCES, SupplierResource
from app.Domains.DataImports.services.exchange_service import ExchangeService


async def get_suppliers(
    session: AsyncSession, supplier_ids: list[UUID] | None = None
) -> list[dict]:
    """Public cross-domain read contract, IDs and timestamps JSON serialized."""
    return [
        SupplierResource.model_validate(s).model_dump(mode="json")
        for s in await CatalogRepository(session).suppliers(supplier_ids)
    ]


async def get_external_references(
    session: AsyncSession, product_ids: list[UUID], supplier_id: UUID, warehouse_id: UUID
) -> dict:
    """Capture these values into the order's immutable approved export revision."""
    products, supplier, warehouse = await CatalogRepository(session).external_references(
        product_ids, supplier_id, warehouse_id
    )
    if supplier is None or warehouse is None or len(products) != len(set(product_ids)):
        raise DomainError(
            "Не найдены объекты для обмена с 1С", status_code=422, code="missing_external_reference"
        )

    def reference(record):
        return dict(
            id=str(record.id),
            source_id=str(record.source_id),
            external_id=record.external_id,
            name=record.name,
        )

    return dict(
        supplier=reference(supplier),
        warehouse=reference(warehouse),
        products=[
            dict(
                **reference(p),
                code=p.code,
                sku=p.sku,
                unit=p.unit,
                characteristic_external_id=p.characteristic_external_id,
            )
            for p in products
        ],
    )


class CatalogService:
    def __init__(self, repository: CatalogRepository, exchange_service: ExchangeService):
        self.repository = repository
        self.exchange_service = exchange_service

    async def list(self, kind, limit, offset, query, active, source_id=None, supplier_id=None):
        if supplier_id is not None and kind != "products":
            raise DomainError(
                "Фильтр поставщика доступен только для товаров",
                status_code=422,
                code="invalid_catalog_filter",
            )
        return [
            RESOURCES[kind].model_validate(r)
            for r in await self.repository.list(
                kind, limit, offset, query, active, source_id, supplier_id
            )
        ]

    async def get(self, kind, record_id):
        record = await self.repository.get(kind, record_id)
        if record is None:
            raise DomainError(
                "Объект справочника не найден", status_code=404, code="catalog_not_found"
            )
        return RESOURCES[kind].model_validate(record)

    async def save(self, kind, command, user_id, record_id=None):
        if command.row.kind != kind:
            raise DomainError(
                "Вид строки не соответствует справочнику",
                status_code=422,
                code="catalog_kind_mismatch",
            )
        if record_id is not None:
            existing = await self.repository.get(kind, record_id)
            if existing is None:
                raise DomainError(
                    "Объект справочника не найден", status_code=404, code="catalog_not_found"
                )
            if (
                existing.source_id != command.source_id
                or existing.external_id != command.row.external_id
            ):
                raise DomainError(
                    "Нельзя менять идентичность объекта источника",
                    status_code=409,
                    code="source_identity_conflict",
                )
        saved_id = await self.exchange_service.apply_catalog(command, user_id)
        return await self.get(kind, saved_id)
