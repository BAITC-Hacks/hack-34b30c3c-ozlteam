from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Catalogs.models import Category, Product, Supplier, Warehouse

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
