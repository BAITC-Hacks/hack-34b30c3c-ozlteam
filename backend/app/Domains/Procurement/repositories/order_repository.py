from hashlib import sha256
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Procurement.models.order import (
    Order,
    OrderAllocation,
    OrderAudit,
    OrderCreation,
    OrderDelivery,
    OrderLine,
)


class OrderRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def lock(self, key: str) -> None:
        number = int.from_bytes(sha256(key.encode()).digest()[:8], "big", signed=True)
        await self.session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": number})

    async def add(self, entity):
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def flush(self):
        await self.session.flush()

    async def creation(self, key: str):
        return await self.session.scalar(
            select(OrderCreation).where(OrderCreation.idempotency_key == key)
        )

    async def allocations(self, ids: list[UUID]):
        return list(
            await self.session.scalars(
                select(OrderAllocation).where(OrderAllocation.recommendation_id.in_(ids))
            )
        )

    async def get(self, order_id: UUID, lock: bool = False):
        query = select(Order).where(Order.id == order_id)
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        return await self.session.scalar(query)

    async def list(self, limit, offset, status=None, supplier_id=None, warehouse_id=None):
        query = select(Order)
        for column, value in (
            (Order.status, status),
            (Order.supplier_id, supplier_id),
            (Order.warehouse_id, warehouse_id),
        ):
            if value is not None:
                query = query.where(column == value)
        return list(
            await self.session.scalars(
                query.order_by(Order.created_at.desc(), Order.id).limit(limit).offset(offset)
            )
        )

    async def lines(self, order_id):
        return list(
            await self.session.scalars(
                select(OrderLine).where(OrderLine.order_id == order_id).order_by(OrderLine.id)
            )
        )

    async def delete_line(self, line):
        await self.session.delete(line)
        await self.session.flush()

    async def audits(self, order_id, limit, offset):
        return list(
            await self.session.scalars(
                select(OrderAudit)
                .where(OrderAudit.order_id == order_id)
                .order_by(OrderAudit.created_at.desc(), OrderAudit.id.desc())
                .limit(limit)
                .offset(offset)
            )
        )

    async def delivery(self, order_id):
        return await self.session.scalar(
            select(OrderDelivery).where(OrderDelivery.order_id == order_id)
        )

    async def successor(self, order_id):
        return await self.session.scalar(select(Order).where(Order.supersedes_order_id == order_id))

    async def revision_event(self, order_id):
        return await self.session.scalar(
            select(OrderAudit).where(
                OrderAudit.order_id == order_id, OrderAudit.action == "revised_from"
            )
        )

    async def count_drafts(self, warehouse_id=None):
        query = select(func.count()).select_from(Order).where(Order.status == "draft")
        if warehouse_id is not None:
            query = query.where(Order.warehouse_id == warehouse_id)
        return await self.session.scalar(query)
