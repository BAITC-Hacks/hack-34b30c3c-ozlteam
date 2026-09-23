from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Catalogs.models import Category, Product, Supplier, Warehouse
from app.Domains.Integrations1C.models import ExchangeBatch, IntegrationSource

MANUAL_SOURCE_NAME = "Ручные справочники Электрокомплект"

MODELS = {
    "products": Product,
    "categories": Category,
    "warehouses": Warehouse,
    "suppliers": Supplier,
}


class CatalogRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(
        self, kind, limit=50, offset=0, query=None, active=None, source_id=None, supplier_id=None
    ):
        model = MODELS[kind]
        stmt = select(model)
        if source_id is not None:
            stmt = stmt.where(model.source_id == source_id)
        if supplier_id is not None and kind == "products":
            stmt = stmt.where(Product.supplier_id == supplier_id)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            conditions = [model.name.ilike(f"%{escaped}%", escape="\\")]
            if kind == "products":
                conditions.append(model.sku.ilike(f"%{escaped}%", escape="\\"))
                conditions.append(model.code.ilike(f"%{escaped}%", escape="\\"))
            stmt = stmt.where(or_(*conditions))
        if active is not None:
            stmt = stmt.where(model.active == active)
        return list(
            await self.session.scalars(
                stmt.order_by(model.name, model.id).limit(limit).offset(offset)
            )
        )

    async def get(self, kind, record_id):
        return await self.session.get(MODELS[kind], record_id)

    async def manual_source(self):
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": "catalogs:manual-source"},
        )
        source = await self.session.scalar(
            select(IntegrationSource)
            .where(
                IntegrationSource.name == MANUAL_SOURCE_NAME, IntegrationSource.system == "manual"
            )
            .order_by(IntegrationSource.created_at, IntegrationSource.id)
            .limit(1)
            .with_for_update()
        )
        if source is None:
            source = IntegrationSource(name=MANUAL_SOURCE_NAME, system="manual", complete=True)
            self.session.add(source)
            await self.session.flush()
        return source

    async def lock_source(self, source_id):
        return await self.session.scalar(
            select(IntegrationSource)
            .where(IntegrationSource.id == source_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    async def lock_record(self, kind, record_id):
        model = MODELS[kind]
        return await self.session.scalar(
            select(model)
            .where(model.id == record_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    async def add_manual(self, kind, source_id, values, payload_hash):
        row = MODELS[kind](
            source_id=source_id,
            external_id=f"local:{uuid4()}",
            source_revision=1,
            payload_hash=payload_hash,
            **values,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def save_manual(self, source, row, actor_id, kind, before, after, payload_hash):
        # source_revision/payload_hash on existing rows describe LAST IMPORT, not local overrides.
        # Preserve them so same-revision retry skips, newer import explicitly supersedes local edit.
        row.updated_at = datetime.now(UTC)
        after["updated_at"] = row.updated_at.isoformat()
        source.revision += 1
        self.session.add(
            ExchangeBatch(
                source_id=source.id,
                batch_key=f"manual:{uuid4()}",
                payload_hash=payload_hash,
                revision=source.revision,
                row_count=1,
                cursor=source.cursor,
                created_by=actor_id,
                summary={
                    "created": int(before is None),
                    "updated": int(before is not None),
                    "unchanged": 0,
                    "origin": "manual",
                    "kind": kind,
                    "record_id": str(row.id),
                    "before": before,
                    "after": after,
                },
            )
        )
        await self.session.flush()

    async def suppliers(self, supplier_ids: list[UUID] | None):
        stmt = select(Supplier)
        if supplier_ids is not None:
            stmt = stmt.where(Supplier.id.in_(supplier_ids))
        return list(await self.session.scalars(stmt.order_by(Supplier.name, Supplier.id)))

    async def external_references(self, product_ids, supplier_id, warehouse_id):
        products = list(
            await self.session.scalars(select(Product).where(Product.id.in_(product_ids)))
        )
        supplier = await self.session.get(Supplier, supplier_id)
        warehouse = await self.session.get(Warehouse, warehouse_id)
        return products, supplier, warehouse
