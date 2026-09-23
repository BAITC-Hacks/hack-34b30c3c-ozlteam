from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import or_, select

from app.Domains.Catalogs.models import Category, Product, Supplier, Warehouse
from app.Domains.Integrations1C.models import IntegrationSource
from app.Domains.Inventory.business_time import BUSINESS_TIMEZONE
from app.Domains.Inventory.models import (
    GrowthForecast,
    InboundShipment,
    InventorySnapshot,
    Sale,
    StockoutInterval,
)

MODELS = {
    "sales": Sale,
    "stocks": InventorySnapshot,
    "inbound": InboundShipment,
    "stockouts": StockoutInterval,
    "growth": GrowthForecast,
}


class InventoryRepository:
    def __init__(self, session):
        self.session = session

    async def category(self, category_id):
        return await self.session.get(Category, category_id)

    async def list(self, kind, warehouse_id, product_id, limit, offset, current=False):
        model = MODELS[kind]
        query = select(model)
        if warehouse_id is not None and hasattr(model, "warehouse_id"):
            query = query.where(model.warehouse_id == warehouse_id)
        if product_id is not None:
            query = query.where(model.product_id == product_id)
        if kind == "stocks" and current:
            query = (
                query.where(model.as_of <= datetime.now(UTC))
                .distinct(model.warehouse_id, model.product_id)
                .order_by(model.warehouse_id, model.product_id, model.as_of.desc(), model.id.desc())
            )
        else:
            query = query.order_by(model.updated_at.desc(), model.id)
        return list(await self.session.scalars(query.limit(limit).offset(offset)))

    async def snapshot_records(self, warehouse_id, category_id, as_of: date):
        # Writers always lock their source FOR UPDATE; retain read locks until the
        # caller commits the calculation snapshot. Stable ordering avoids deadlocks.
        sources = list(
            await self.session.scalars(
                select(IntegrationSource).order_by(IntegrationSource.id).with_for_update(read=True)
            )
        )
        warehouse = await self.session.get(Warehouse, warehouse_id)
        query = (
            select(Product, Category, Supplier)
            .outerjoin(Category, Product.category_id == Category.id)
            .outerjoin(Supplier, Product.supplier_id == Supplier.id)
            .where(Product.active.is_(True))
        )
        if warehouse is not None:
            query = query.where(Product.source_id == warehouse.source_id)
        if category_id is not None:
            query = query.where(Product.category_id == category_id)
        products = list((await self.session.execute(query.order_by(Product.id))).all())
        product_ids = [p.id for p, _, _ in products]
        category_ids = list({p.category_id for p, _, _ in products if p.category_id is not None})
        cutoff = datetime.combine(as_of + timedelta(days=1), time.min, BUSINESS_TIMEZONE)
        sales = list(
            await self.session.scalars(
                select(Sale)
                .where(
                    Sale.warehouse_id == warehouse_id,
                    Sale.product_id.in_(product_ids),
                    Sale.date <= as_of,
                    Sale.status == "posted",
                )
                .order_by(Sale.date, Sale.id)
            )
        )
        stocks = list(
            await self.session.scalars(
                select(InventorySnapshot)
                .where(
                    InventorySnapshot.warehouse_id == warehouse_id,
                    InventorySnapshot.product_id.in_(product_ids),
                    InventorySnapshot.as_of < cutoff,
                )
                .distinct(InventorySnapshot.product_id)
                .order_by(
                    InventorySnapshot.product_id,
                    InventorySnapshot.as_of.desc(),
                    InventorySnapshot.id.desc(),
                )
            )
        )
        inbound = list(
            await self.session.scalars(
                select(InboundShipment)
                .where(
                    InboundShipment.warehouse_id == warehouse_id,
                    InboundShipment.product_id.in_(product_ids),
                    InboundShipment.status.in_(("confirmed", "in_transit")),
                )
                .order_by(InboundShipment.expected_date, InboundShipment.id)
            )
        )
        stockouts = list(
            await self.session.scalars(
                select(StockoutInterval)
                .where(
                    StockoutInterval.warehouse_id == warehouse_id,
                    StockoutInterval.active.is_(True),
                    StockoutInterval.product_id.in_(product_ids),
                    StockoutInterval.start <= as_of,
                )
                .order_by(StockoutInterval.start, StockoutInterval.id)
            )
        )
        growth = list(
            await self.session.scalars(
                select(GrowthForecast)
                .where(
                    or_(
                        GrowthForecast.product_id.in_(product_ids),
                        GrowthForecast.category_id.in_(category_ids),
                    )
                )
                .where(GrowthForecast.active.is_(True))
                .order_by(GrowthForecast.start, GrowthForecast.id)
            )
        )
        return sources, warehouse, products, sales, stocks, inbound, stockouts, growth
