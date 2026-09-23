from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.Domains.Inventory.business_time import BUSINESS_TIMEZONE
from app.Domains.Inventory.repositories.inventory_repository import InventoryRepository
from app.Domains.Inventory.resources.inventory import RESOURCES


async def get_snapshot(
    session: AsyncSession, warehouse_id: UUID, category_id: UUID | None, as_of: date
) -> dict:
    """Public immutable JSON-compatible input; caller persists it inside this transaction."""
    return await InventoryService(InventoryRepository(session)).snapshot(
        warehouse_id, category_id, as_of
    )


class InventoryService:
    def __init__(self, repository: InventoryRepository):
        self.repository = repository

    async def list(self, kind, warehouse_id, product_id, limit, offset, current=False):
        return [
            RESOURCES[kind].model_validate(row)
            for row in await self.repository.list(
                kind, warehouse_id, product_id, limit, offset, current
            )
        ]

    async def snapshot(self, warehouse_id, category_id, as_of):
        (
            sources,
            warehouse,
            products,
            sales,
            stocks,
            inbound,
            stockouts,
            growth,
        ) = await self.repository.snapshot_records(warehouse_id, category_id, as_of)
        if warehouse is None or not warehouse.active:
            raise DomainError(
                "Склад не найден или неактивен", status_code=404, code="warehouse_not_found"
            )
        if category_id is not None:
            category = await self.repository.category(category_id)
            if category is None or not category.active or category.source_id != warehouse.source_id:
                raise DomainError(
                    "Категория не найдена в источнике склада",
                    status_code=404,
                    code="category_not_found",
                )
        relevant_sources = [s for s in sources if s.id == warehouse.source_id]
        if any(not s.complete for s in relevant_sources):
            raise DomainError(
                "Синхронизация источника не завершена", status_code=409, code="incomplete_source"
            )
        warnings = []
        if not sales:
            warnings.append("Нет истории продаж выбранного склада")
        if not stockouts:
            warnings.append("Интервалы stockout не переданы; восстановление спроса ограничено")
        if any(s.client_id is None for s in sales):
            warnings.append("Часть продаж без обезличенного клиента; анализ покупателя ограничен")
        stocked = {s.product_id for s in stocks}
        product_data = []
        for p, category, supplier in products:
            product_warnings = []
            if p.id not in stocked:
                product_warnings.append("Нет остатка для товара")
            if category is None:
                product_warnings.append("Нет категории для товара; политика 7/7 дней")
            product_data.append(
                dict(
                    id=str(p.id),
                    source_id=str(p.source_id),
                    external_id=p.external_id,
                    code=p.code,
                    characteristic_external_id=p.characteristic_external_id,
                    sku=p.sku,
                    name=p.name,
                    category_id=str(p.category_id) if p.category_id else None,
                    supplier_id=str(p.supplier_id) if supplier and supplier.active else None,
                    lead_time_days=p.lead_time_days,
                    unit=p.unit,
                    pack_size=str(p.pack_size),
                    min_order_qty=str(p.min_order_qty),
                    review_days=category.review_days if category else 7,
                    safety_days=category.safety_days if category else 7,
                    active=p.active,
                    data_quality=getattr(p, "data_quality", {}),
                    warnings=product_warnings,
                )
            )
        return dict(
            products=product_data,
            sales=[
                dict(
                    product_id=str(s.product_id),
                    date=s.date.isoformat(),
                    quantity=str(s.quantity),
                    client_id=s.client_id,
                    document_id=s.document_id,
                )
                for s in sales
            ],
            stocks=[
                dict(
                    product_id=str(s.product_id),
                    as_of=s.as_of.astimezone(BUSINESS_TIMEZONE).date().isoformat(),
                    quantity=str(s.quantity),
                    reserved=str(s.reserved),
                )
                for s in stocks
            ],
            inbound=[
                dict(
                    product_id=str(s.product_id),
                    expected_date=s.expected_date.isoformat(),
                    quantity=str(s.quantity),
                    status=s.status,
                )
                for s in inbound
            ],
            stockouts=[
                dict(
                    product_id=str(s.product_id),
                    start=s.start.isoformat(),
                    end=s.end.isoformat() if s.end else None,
                )
                for s in stockouts
            ],
            growth=[
                dict(
                    product_id=str(s.product_id) if s.product_id else None,
                    category_id=str(s.category_id) if s.category_id else None,
                    start=s.start.isoformat(),
                    end=s.end.isoformat(),
                    rate=str(s.rate),
                    mode=s.mode,
                )
                for s in growth
            ],
            source_versions=[
                dict(
                    source_id=str(s.id),
                    revision=s.revision,
                    cursor=s.cursor,
                    synced_at=s.synced_at.isoformat() if s.synced_at else None,
                    complete=s.complete,
                )
                for s in relevant_sources
            ],
            warnings=warnings,
        )
