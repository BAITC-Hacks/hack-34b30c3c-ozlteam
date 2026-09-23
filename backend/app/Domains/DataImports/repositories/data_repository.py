from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Catalogs.models import Category, Product, Supplier, Warehouse
from app.Domains.DataImports.models import ImportBatch
from app.Domains.Integrations1C.models import ExchangeBatch, IntegrationSource
from app.Domains.Inventory.models import (
    GrowthForecast,
    InboundShipment,
    InventorySnapshot,
    Sale,
    StockoutInterval,
)

MODELS = {
    "categories": Category,
    "suppliers": Supplier,
    "warehouses": Warehouse,
    "products": Product,
    "sales": Sale,
    "stocks": InventorySnapshot,
    "inbound": InboundShipment,
    "stockouts": StockoutInterval,
    "growth": GrowthForecast,
}
REFERENCES = {
    "category_external_id": (Category, "category_id"),
    "supplier_external_id": (Supplier, "supplier_id"),
    "product_external_id": (Product, "product_id"),
    "warehouse_external_id": (Warehouse, "warehouse_id"),
}


class DataRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def source(self, source_id: UUID, lock=False):
        query = select(IntegrationSource).where(IntegrationSource.id == source_id)
        if lock:
            query = query.with_for_update()
        return await self.session.scalar(query)

    async def sources(self):
        return list(
            await self.session.scalars(select(IntegrationSource).order_by(IntegrationSource.id))
        )

    async def lock_sources(self):
        return list(
            await self.session.scalars(
                select(IntegrationSource).order_by(IntegrationSource.id).with_for_update(read=True)
            )
        )

    async def create_source(self, **data):
        source = IntegrationSource(**data)
        self.session.add(source)
        await self.session.flush()
        return source

    async def record(self, kind: str, source_id: UUID, external_id: str):
        model = MODELS[kind]
        return await self.session.scalar(
            select(model).where(model.source_id == source_id, model.external_id == external_id)
        )

    async def resolve(self, field: str, external_id: str, source_id: UUID):
        model, target = REFERENCES[field]
        value = await self.session.scalar(
            select(model.id).where(model.source_id == source_id, model.external_id == external_id)
        )
        return target, value

    async def write(self, kind: str, existing, values: dict):
        if existing is None:
            existing = MODELS[kind](**values)
            self.session.add(existing)
        else:
            for key, value in values.items():
                setattr(existing, key, value)
        await self.session.flush()
        return existing

    async def natural_conflict(self, kind: str, values: dict):
        """Detect renamed external IDs that would double-count one accounting fact."""
        if kind == "growth":
            if not values["active"]:
                return False
            query = (
                select(GrowthForecast.id)
                .where(
                    GrowthForecast.source_id == values["source_id"],
                    GrowthForecast.external_id != values["external_id"],
                    GrowthForecast.active.is_(True),
                    GrowthForecast.product_id == values["product_id"],
                    GrowthForecast.category_id == values["category_id"],
                    GrowthForecast.start <= values["end"],
                    GrowthForecast.end >= values["start"],
                )
                .limit(1)
            )
            return await self.session.scalar(query) is not None
        keys = {
            "sales": ("warehouse_id", "document_id", "line_id"),
            "stocks": ("warehouse_id", "product_id", "as_of"),
        }.get(kind)
        if keys is None:
            return False
        model = MODELS[kind]
        query = (
            select(model.id)
            .where(
                model.source_id == values["source_id"],
                model.external_id != values["external_id"],
                *(getattr(model, key) == values[key] for key in keys),
            )
            .limit(1)
        )
        return await self.session.scalar(query) is not None

    async def batch(self, source_id: UUID, key: str):
        return await self.session.scalar(
            select(ExchangeBatch).where(
                ExchangeBatch.source_id == source_id, ExchangeBatch.batch_key == key
            )
        )

    async def finish_exchange(self, source, command, user_id, payload_hash, summary):
        source.revision += 1
        source.cursor = command.cursor
        source.complete = command.complete
        source.synced_at = datetime.now(UTC)
        batch = ExchangeBatch(
            source_id=source.id,
            batch_key=command.batch_key,
            payload_hash=payload_hash,
            revision=source.revision,
            cursor=source.cursor,
            row_count=len(command.rows),
            created_by=user_id,
            summary=summary,
        )
        self.session.add(batch)
        await self.session.flush()
        return batch

    async def exchanges(self, source_id: UUID, limit: int, offset: int):
        return list(
            await self.session.scalars(
                select(ExchangeBatch)
                .where(ExchangeBatch.source_id == source_id)
                .order_by(ExchangeBatch.created_at.desc(), ExchangeBatch.id)
                .limit(limit)
                .offset(offset)
            )
        )

    async def create_import(self, **values):
        batch = ImportBatch(**values)
        self.session.add(batch)
        await self.session.flush()
        return batch

    async def get_import(self, batch_id: UUID, lock=False):
        query = select(ImportBatch).where(ImportBatch.id == batch_id)
        if lock:
            query = query.with_for_update()
        return await self.session.scalar(query)

    async def imports(self, limit: int, offset: int):
        return list(
            await self.session.scalars(
                select(ImportBatch)
                .order_by(ImportBatch.created_at.desc(), ImportBatch.id)
                .limit(limit)
                .offset(offset)
            )
        )

    async def mark_applied(self, batch):
        batch.status = "applied"
        batch.applied_at = datetime.now(UTC)
        await self.session.flush()
