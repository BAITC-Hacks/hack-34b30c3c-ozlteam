from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.Domains.Catalogs.DTO.manual import FIELDS
from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
from app.Domains.Catalogs.resources.catalog import RESOURCES, SupplierResource
from app.Domains.DataImports.services.exchange_service import ExchangeService, digest


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

    async def save_manual(self, kind, command, user_id, record_id=None):
        values = command.model_dump(
            exclude_unset=True, exclude={"expected_updated_at", "source_id"}
        )
        if not values or set(values) - FIELDS[kind]:
            raise DomainError(
                "Переданы пустые или неподходящие для справочника поля",
                422,
                "invalid_catalog_fields",
            )
        if "name" in values and len(values["name"]) > (500 if kind == "products" else 300):
            raise DomainError("Название слишком длинное", 422, "invalid_catalog_name")
        row = None
        before = None
        if record_id is not None:
            current = await self.repository.get(kind, record_id)
            if current is None:
                raise DomainError("Объект справочника не найден", 404, "catalog_not_found")
            source = await self.repository.lock_source(current.source_id)
            row = await self.repository.lock_record(kind, record_id)
            if row.updated_at != command.expected_updated_at:
                raise DomainError(
                    "Объект изменился. Обновите форму перед сохранением", 409, "stale_updated_at"
                )
            before = RESOURCES[kind].model_validate(row).model_dump(mode="json")
        else:
            if kind == "products" and not {"sku", "unit"} <= values.keys():
                raise DomainError(
                    "Для товара обязательны sku и unit", 422, "missing_product_fields"
                )
            source = (
                await self.repository.lock_source(command.source_id)
                if command.source_id
                else await self.repository.manual_source()
            )
            if source is None:
                raise DomainError("Источник не найден", 404, "source_not_found")
        if kind == "products":
            for field, target in (("category_id", "categories"), ("supplier_id", "suppliers")):
                if field in values and values[field] is not None:
                    reference = await self.repository.get(target, values[field])
                    if reference is None or not reference.active:
                        raise DomainError(
                            "Связанный объект не найден или архивирован",
                            422,
                            "invalid_catalog_reference",
                        )
                    if reference.source_id != source.id:
                        raise DomainError(
                            "Связанный объект должен принадлежать тому же источнику",
                            422,
                            "catalog_reference_source_mismatch",
                        )
            # Only our own unknown-term flags may be cleared by supplying those terms.
            # Never erase quality restrictions imported from 1C/package validation.
            if row is None or row.data_quality.get("origin") == "manual_catalog":
                unknown = set(
                    row.data_quality.get("unknown_terms", [])
                    if row
                    else {"pack_size", "min_order_qty", "lead_time_days"}
                )
                for field in {"pack_size", "min_order_qty", "lead_time_days"} & values.keys():
                    if values[field] is None:
                        unknown.add(field)
                    else:
                        unknown.discard(field)
                values["data_quality"] = {
                    "origin": "manual_catalog",
                    "unknown_terms": sorted(unknown),
                    "status": "blocked" if unknown else "limited",
                    "blocking_reasons": [f"unconfirmed_{field}" for field in sorted(unknown)],
                    "warnings": ["manual_catalog_history_and_stock_not_verified"],
                }
        payload_hash = digest(command.model_dump(mode="json", exclude_unset=True))
        if row is None:
            row = await self.repository.add_manual(kind, source.id, values, payload_hash)
        else:
            for field, value in values.items():
                setattr(row, field, value)
        after = RESOURCES[kind].model_validate(row).model_dump(mode="json")
        await self.repository.save_manual(source, row, user_id, kind, before, after, payload_hash)
        return RESOURCES[kind].model_validate(row)
