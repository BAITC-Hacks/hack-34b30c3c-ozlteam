import csv
import json
from collections import defaultdict
from datetime import UTC, datetime
from hashlib import sha256
from io import BytesIO, StringIO
from typing import Protocol
from uuid import UUID

from openpyxl import Workbook

from app.core.errors import DomainError
from app.Domains.Procurement.contracts import OrderStore
from app.Domains.Procurement.models.order import (
    Order,
    OrderAllocation,
    OrderAudit,
    OrderCreation,
    OrderDelivery,
    OrderLine,
)
from app.Domains.Procurement.resources.order import (
    DeliveryOut,
    ExternalReferences,
    HandoffOut,
    LineOut,
    OrderOut,
)


class Source(Protocol):
    async def recommendations(self, ids): ...
    async def suppliers(self, ids): ...
    async def references(self, product_ids, supplier_id, warehouse_id): ...


def conflict(detail, code="order_conflict"):
    return DomainError(detail, status_code=409, code=code)


class OrderService:
    def __init__(self, repository: OrderStore, source: Source):
        self.repository = repository
        self.source = source

    async def create(self, data, actor_id: UUID):
        ids = sorted(data.recommendation_ids, key=str)
        digest = sha256(json.dumps([str(x) for x in ids]).encode()).hexdigest()
        await self.repository.lock("order-creation:" + data.idempotency_key)
        existing = await self.repository.creation(data.idempotency_key)
        if existing:
            if existing.request_hash != digest:
                raise conflict("Idempotency key already used for another request")
            return [await self.get(UUID(identifier)) for identifier in existing.order_ids]
        for identifier in ids:
            await self.repository.lock("order-allocation:" + str(identifier))
        if await self.repository.allocations(ids):
            raise conflict("Recommendation already allocated to an order", "already_allocated")
        recommendations = await self.source.recommendations(ids)
        if {UUID(str(row["id"])) for row in recommendations} != set(ids):
            raise DomainError("Recommendation not found", status_code=404, code="not_found")
        supplier_ids = sorted({UUID(str(row["supplier_id"])) for row in recommendations}, key=str)
        suppliers = {UUID(str(row["id"])): row for row in await self.source.suppliers(supplier_ids)}
        groups = defaultdict(list)
        for row in recommendations:
            supplier_id = UUID(str(row["supplier_id"]))
            supplier = suppliers.get(supplier_id)
            if not supplier or not supplier.get("active", True):
                raise conflict("Supplier missing or inactive", "supplier_unavailable")
            if row["recommended_quantity"] <= 0 or row.get("status", "ready") != "ready":
                raise conflict("Recommendation cannot be ordered", "recommendation_blocked")
            groups[(supplier_id, UUID(str(row["warehouse_id"])))].append(row)
        orders = []
        for (supplier_id, warehouse_id), rows in groups.items():
            references = ExternalReferences.model_validate(
                await self.source.references(
                    sorted({UUID(str(row["product_id"])) for row in rows}, key=str),
                    supplier_id,
                    warehouse_id,
                )
            )
            order = await self.repository.add(
                Order(
                    supplier_id=supplier_id,
                    warehouse_id=warehouse_id,
                    supplier_name=suppliers[supplier_id]["name"],
                    created_by=actor_id,
                    status="draft",
                    version=1,
                    revision=1,
                    comment="",
                    external_references=references.model_dump(mode="json"),
                )
            )
            for row in rows:
                await self.repository.add(
                    OrderLine(
                        order_id=order.id,
                        recommendation_id=UUID(str(row["id"])),
                        run_id=UUID(str(row["run_id"])),
                        product_id=UUID(str(row["product_id"])),
                        sku=row["sku"],
                        name=row["name"],
                        unit=row["unit"],
                        recommended_quantity=row["recommended_quantity"],
                        quantity=row["recommended_quantity"],
                        reason="",
                    )
                )
                await self.repository.add(
                    OrderAllocation(
                        recommendation_id=UUID(str(row["id"])),
                        order_id=order.id,
                    )
                )
            await self._audit(
                order, actor_id, "created", {"recommendations": [str(row["id"]) for row in rows]}
            )
            orders.append(await self._resource(order))
        await self.repository.add(
            OrderCreation(
                idempotency_key=data.idempotency_key,
                request_hash=digest,
                order_ids=[str(order.id) for order in orders],
            )
        )
        return orders

    async def _require(self, order_id, lock=False):
        order = await self.repository.get(order_id, lock)
        if order is None:
            raise DomainError("Order not found", status_code=404, code="not_found")
        return order

    async def _resource(self, order):
        if order.approved_snapshot is not None:
            return OrderOut.model_validate(order.approved_snapshot)
        fields = {name: getattr(order, name) for name in OrderOut.model_fields if name != "lines"}
        fields["lines"] = [
            LineOut.model_validate(line) for line in await self.repository.lines(order.id)
        ]
        return OrderOut.model_validate(fields)

    async def get(self, order_id):
        return await self._resource(await self._require(order_id))

    async def list(self, limit=50, offset=0, status=None, supplier_id=None, warehouse_id=None):
        return [
            await self._resource(order)
            for order in await self.repository.list(
                limit, offset, status, supplier_id, warehouse_id
            )
        ]

    async def _draft(self, order_id, expected_version):
        order = await self._require(order_id, lock=True)
        if order.status != "draft":
            raise conflict("Approved order is immutable", "order_immutable")
        if order.version != expected_version:
            raise conflict("Order version changed; reload before editing", "version_conflict")
        return order

    async def _audit(self, order, actor_id, action, data):
        await self.repository.add(
            OrderAudit(
                order_id=order.id,
                actor_id=actor_id,
                action=action,
                data={**data, "version": order.version},
            )
        )

    async def edit(self, order_id, data, actor_id):
        order = await self._draft(order_id, data.expected_version)
        before = order.comment
        order.comment = data.comment
        order.version += 1
        await self._audit(
            order,
            actor_id,
            "edited",
            {
                "before": before,
                "after": order.comment,
                "reason": data.reason,
            },
        )
        return await self._resource(order)

    async def edit_line(self, order_id, line_id, data, actor_id, delete=False):
        order = await self._draft(order_id, data.expected_version)
        line = next(
            (line for line in await self.repository.lines(order_id) if line.id == line_id), None
        )
        if line is None:
            raise DomainError("Order line not found", status_code=404, code="not_found")
        before = LineOut.model_validate(line).model_dump(mode="json")
        if delete:
            await self.repository.delete_line(line)
        else:
            line.quantity = data.quantity
            line.reason = data.reason
        order.version += 1
        await self._audit(
            order,
            actor_id,
            "line_deleted" if delete else "line_edited",
            {
                "line_id": str(line_id),
                "before": before,
                "after": None if delete else LineOut.model_validate(line).model_dump(mode="json"),
                "reason": data.reason,
            },
        )
        return await self._resource(order)

    async def approve(self, order_id, data, actor_id):
        order = await self._draft(order_id, data.expected_version)
        lines = await self.repository.lines(order_id)
        if not lines or any(line.quantity <= 0 for line in lines):
            raise conflict("Cannot approve empty order or non-positive quantities")
        draft = await self._resource(order)
        order.status = "approved"
        order.version += 1
        order.approved_by = actor_id
        order.approved_at = datetime.now(UTC)
        snapshot = draft.model_copy(
            update={
                "status": order.status,
                "version": order.version,
                "approved_by": order.approved_by,
                "approved_at": order.approved_at,
            }
        )
        order.approved_snapshot = snapshot.model_dump(mode="json")
        await self.repository.add(
            OrderDelivery(order_id=order.id, revision=order.revision, status="pending", message="")
        )
        await self._audit(order, actor_id, "approved", {"revision": order.revision})
        return snapshot

    async def audits(self, order_id, limit=50, offset=0):
        await self._require(order_id)
        return await self.repository.audits(order_id, limit, offset)

    async def revise(self, order_id, data, actor_id):
        previous = await self._require(order_id, lock=True)
        if previous.status != "approved":
            raise conflict("Only approved orders can be revised", "approval_required")
        if previous.version != data.expected_version:
            raise conflict("Order version changed; reload before revising", "version_conflict")
        delivery = await self.repository.delivery(order_id)
        if delivery.status != "rejected":
            raise conflict("Revision requires explicit 1C rejection", "revision_requires_rejection")
        successor = await self.repository.successor(order_id)
        if successor is not None:
            event = await self.repository.revision_event(successor.id)
            if event is None or event.data["reason"] != data.reason:
                raise conflict("An order revision already exists", "revision_exists")
            return await self._resource(successor)
        snapshot = await self._resource(previous)
        successor = await self.repository.add(
            Order(
                supplier_id=snapshot.supplier_id,
                supplier_name=snapshot.supplier_name,
                warehouse_id=snapshot.warehouse_id,
                status="draft",
                version=1,
                revision=snapshot.revision + 1,
                supersedes_order_id=previous.id,
                comment=snapshot.comment,
                external_references=snapshot.external_references.model_dump(mode="json"),
                created_by=actor_id,
            )
        )
        for line in snapshot.lines:
            await self.repository.add(
                OrderLine(
                    order_id=successor.id,
                    **line.model_dump(exclude={"id"}),
                )
            )
        # Original claims remain allocated. Only this explicit path may copy their lines.
        await self._audit(
            previous,
            actor_id,
            "superseded",
            {
                "successor_order_id": str(successor.id),
                "reason": data.reason,
            },
        )
        await self._audit(
            successor,
            actor_id,
            "revised_from",
            {
                "previous_order_id": str(previous.id),
                "reason": data.reason,
            },
        )
        return await self._resource(successor)

    async def handoff(self, order_id):
        order = await self._require(order_id, lock=True)
        if order.status != "approved":
            raise conflict("Only approved orders can be exported", "approval_required")
        if await self.repository.successor(order_id) is not None:
            raise conflict("Order has a newer revision", "order_superseded")
        delivery = await self.repository.delivery(order_id)
        if delivery.status == "rejected":
            raise conflict("Revise rejected document before a new handoff", "delivery_rejected")
        return HandoffOut(
            idempotency_key=f"order:{order.id}:revision:{order.revision}",
            order=await self._resource(order),
            delivery=DeliveryOut.model_validate(delivery),
        )

    async def acknowledge(self, order_id, data, actor_id):
        order = await self._require(order_id, lock=True)
        if order.status != "approved" or data.revision != order.revision:
            raise conflict("Approved revision does not match", "revision_conflict")
        delivery = await self.repository.delivery(order_id)
        same = (delivery.status, delivery.external_document_id, delivery.message) == (
            data.status,
            data.external_document_id,
            data.message,
        )
        if same:
            return DeliveryOut.model_validate(delivery)
        if await self.repository.successor(order_id) is not None:
            raise conflict("Order has a newer revision", "order_superseded")
        if delivery.status == "accepted":
            raise conflict("Accepted handoff cannot be replaced", "delivery_conflict")
        delivery.status = data.status
        delivery.external_document_id = data.external_document_id
        delivery.message = data.message
        delivery.acknowledged_by = actor_id
        delivery.acknowledged_at = datetime.now(UTC)
        await self._audit(order, actor_id, "1c_acknowledged", data.model_dump(mode="json"))
        return DeliveryOut.model_validate(delivery)

    async def export(self, order_id, format):
        order = await self.get(order_id)
        if order.status != "approved":
            raise conflict("Only approved orders can be exported", "approval_required")
        rows = [
            [
                "order_id",
                "revision",
                "supplier_id",
                "warehouse_id",
                "sku",
                "name",
                "unit",
                "quantity",
            ]
        ]
        rows.extend(
            [
                str(order.id),
                str(order.revision),
                str(order.supplier_id),
                str(order.warehouse_id),
                line.sku,
                line.name,
                line.unit,
                format_quantity(line.quantity),
            ]
            for line in order.lines
        )
        # All cells are text; numbers remain exact Decimal strings, with no binary float conversion.
        if format == "csv":
            output = StringIO(newline="")
            csv.writer(output).writerows([[safe_csv(value) for value in row] for row in rows])
            return output.getvalue().encode("utf-8-sig")
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Order"
        for row in rows:
            sheet.append(row)
            for cell in sheet[sheet.max_row]:
                cell.data_type = "s"
        output = BytesIO()
        workbook.save(output)
        workbook.close()
        return output.getvalue()


def format_quantity(quantity):
    return format(quantity, "f")


def safe_csv(value: str) -> str:
    if value.lstrip().startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")):
        return "'" + value
    return value


async def count_draft_orders(session, warehouse_id: UUID | None = None) -> int:
    """Public read facade for overview aggregates."""
    from app.Domains.Procurement.repositories.order_repository import OrderRepository

    return await OrderRepository(session).count_drafts(warehouse_id)
