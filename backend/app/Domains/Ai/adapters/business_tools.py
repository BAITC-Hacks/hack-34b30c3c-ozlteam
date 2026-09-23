"""Permission-checked bridge to existing domains; no SQL or arbitrary execution."""

from pydantic import ValidationError

from app.core.errors import DomainError
from app.Domains.Ai.DTO.agent_tools import PROPOSAL_ARGUMENTS, READ_ARGUMENTS
from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
from app.Domains.Catalogs.services.catalog_service import CatalogService
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.repositories.package_repository import PackageRepository
from app.Domains.DataImports.services.exchange_service import ExchangeService
from app.Domains.DataImports.services.package_service import PackageService
from app.Domains.Inventory.repositories.inventory_repository import InventoryRepository
from app.Domains.Inventory.services.inventory_service import InventoryService
from app.Domains.Procurement.adapters.source import OrderSource
from app.Domains.Procurement.DTO.order import CreateOrders
from app.Domains.Procurement.repositories.order_repository import OrderRepository
from app.Domains.Procurement.services.order_service import OrderService, count_draft_orders
from app.Domains.Replenishment.DTO.calculation import CreateCalculation
from app.Domains.Replenishment.repositories.calculation_repository import (
    SqlAlchemyCalculationRepository,
)
from app.Domains.Replenishment.resources.calculation import RunOut
from app.Domains.Replenishment.services.replenishment_service import ReplenishmentService

READ_PERMISSIONS = {
    "search_catalog": ("catalogs.read",),
    "get_overview": ("replenishment.read", "orders.read"),
    "get_stock": ("inventory.read",),
    "get_inbound": ("inventory.read",),
    "list_runs": ("replenishment.read",),
    "get_run": ("replenishment.read",),
    "list_recommendations": ("replenishment.read",),
    "get_recommendation": ("replenishment.read",),
    "list_orders": ("orders.read",),
    "get_order": ("orders.read",),
    "list_packages": ("imports.read",),
    "get_package": ("imports.read",),
}
WRITE_PERMISSIONS = {
    "calculate": ("replenishment.run", "catalogs.read"),
    "create_orders": ("orders.write", "replenishment.read", "catalogs.read"),
    "apply_package": ("imports.write", "imports.read"),
}


def validated(registry, name, arguments):
    schema = registry.get(name)
    if schema is None:
        raise DomainError("Инструмент не разрешён", 422, "unknown_agent_tool")
    try:
        return schema.model_validate(arguments)
    except ValidationError as exc:
        raise DomainError("Неверные параметры инструмента", 422, "invalid_tool_arguments") from exc


def select(value, *fields):
    """Explicit field projection: never send ORM/private/source payloads to the model."""
    data = value.model_dump(mode="json") if hasattr(value, "model_dump") else value
    return {key: data[key] for key in fields if key in data}


def run_summary(run):
    return select(
        RunOut.model_validate(run),
        "id",
        "warehouse_id",
        "category_id",
        "as_of",
        "status",
        "algorithm_version",
        "warnings",
        "job_id",
        "created_at",
    )


def recommendation_summary(row):
    result = select(
        row,
        "id",
        "run_id",
        "product_id",
        "supplier_id",
        "warehouse_id",
        "sku",
        "name",
        "unit",
        "recommended_quantity",
        "status",
        "urgency",
        "explanation",
        "order_id",
    )
    if hasattr(row, "details"):
        result["breakdown"] = row.details.breakdown.model_dump(mode="json")
        result["warnings"] = row.details.warnings[:20]
    return result


def order_summary(row):
    result = select(row, "id", "supplier_id", "supplier_name", "warehouse_id", "status", "version")
    result["line_count"] = len(row.lines)
    result["lines"] = [
        select(line, "product_id", "sku", "name", "quantity", "unit") for line in row.lines[:20]
    ]
    result["lines_truncated"] = len(row.lines) > 20
    return result


def package_summary(row):
    result = select(row, "id", "name", "status", "row_count", "processed_rows", "issue_count")
    # The summary's whitelisted aggregate only; files/options can contain private provenance.
    result["by_status"] = {
        key: value
        for key, value in row.summary.get("by_status", {}).items()
        if key in {"ready", "limited", "blocked"} and isinstance(value, int)
    }
    return result


class BusinessTools:
    def __init__(self, session, user):
        self.session = session
        self.user = user

    def _require(self, permissions):
        if not all(self.user.has_permission(code) for code in permissions):
            raise DomainError("Недостаточно прав для инструмента", 403, "tool_forbidden")

    def _catalogs(self):
        return CatalogService(
            CatalogRepository(self.session), ExchangeService(DataRepository(self.session))
        )

    def _calculations(self, jobs=None):
        return ReplenishmentService(SqlAlchemyCalculationRepository(self.session), jobs)

    def _orders(self):
        return OrderService(OrderRepository(self.session), OrderSource(self.session))

    def _packages(self, jobs=None):
        return PackageService(PackageRepository(self.session), jobs=jobs)

    async def execute_read(self, name: str, args: dict) -> dict:
        command = validated(READ_ARGUMENTS, name, args)
        if name not in READ_PERMISSIONS:
            raise DomainError("Инструмент не разрешён", 422, "unknown_agent_tool")
        self._require(READ_PERMISSIONS[name])
        if name == "search_catalog":
            rows = await self._catalogs().list(
                command.kind, command.limit, command.offset, command.query, True
            )
            return {
                "items": [
                    select(
                        row,
                        "id",
                        "name",
                        "sku",
                        "code",
                        "unit",
                        "supplier_id",
                        "category_id",
                        "pack_size",
                        "min_order_qty",
                        "lead_time_days",
                        "active",
                    )
                    for row in rows
                ],
                "limit": command.limit,
                "offset": command.offset,
            }
        if name in {"get_stock", "get_inbound"}:
            rows = await InventoryService(InventoryRepository(self.session)).list(
                "stocks" if name == "get_stock" else "inbound",
                command.warehouse_id,
                command.product_id,
                command.limit,
                command.offset,
                current=name == "get_stock",
            )
            return {
                "items": [
                    select(
                        row,
                        "id",
                        "product_id",
                        "warehouse_id",
                        "supplier_id",
                        "as_of",
                        "quantity",
                        "reserved",
                        "expected_date",
                        "status",
                    )
                    for row in rows
                ],
                "limit": command.limit,
                "offset": command.offset,
            }
        if name == "get_overview":
            result = await self._calculations().overview(
                command.warehouse_id, await count_draft_orders(self.session, command.warehouse_id)
            )
            return {
                **select(
                    result,
                    "deficit_count",
                    "excess_count",
                    "blocked_count",
                    "draft_order_count",
                    "warnings",
                ),
                "latest_run": run_summary(result["latest_run"]) if result["latest_run"] else None,
            }
        if name == "list_runs":
            result = await self._calculations().list(
                command.limit, command.offset, command.warehouse_id
            )
            return {**result, "items": [run_summary(row) for row in result["items"]]}
        if name == "get_run":
            return run_summary(await self._calculations().get(command.id))
        if name == "list_recommendations":
            result = await self._calculations().recommendations(
                command.run_id, command.limit, command.offset, command.supplier_id, command.urgency
            )
            return {
                "items": [recommendation_summary(row) for row in result["items"]],
                "total": result["total"],
                "limit": command.limit,
                "offset": command.offset,
            }
        if name == "get_recommendation":
            return recommendation_summary(await self._calculations().recommendation(command.id))
        if name == "list_orders":
            rows = await self._orders().list(
                command.limit,
                command.offset,
                command.status,
                command.supplier_id,
                command.warehouse_id,
            )
            return {
                "items": [
                    select(
                        row,
                        "id",
                        "supplier_id",
                        "supplier_name",
                        "warehouse_id",
                        "status",
                        "version",
                    )
                    for row in rows
                ],
                "limit": command.limit,
                "offset": command.offset,
            }
        if name == "get_order":
            return order_summary(await self._orders().get(command.id))
        if name == "list_packages":
            result = await self._packages().list(command.limit, command.offset)
            return {**result, "items": [package_summary(row) for row in result["items"]]}
        return package_summary(self._packages().resource(await self._packages().get(command.id)))

    async def prepare(self, kind: str, payload: dict) -> dict:
        command = validated(PROPOSAL_ARGUMENTS, kind, payload)
        self._require(WRITE_PERMISSIONS[kind])
        payload = command.model_dump(mode="json")
        if kind == "calculate":
            # Reuse production date/parameter validation, not the model's interpretation.
            CreateCalculation(
                warehouse_id=command.warehouse_id,
                category_id=command.category_id,
                as_of=command.as_of,
                parameters={"history_days": command.history_days},
                idempotency_key="preview",
            )
            warehouse = await self._catalogs().get("warehouses", command.warehouse_id)
            if not warehouse.active:
                raise DomainError("Склад неактивен", 409, "warehouse_inactive")
            if command.category_id:
                category = await self._catalogs().get("categories", command.category_id)
                if not category.active or category.source_id != warehouse.source_id:
                    raise DomainError("Категория не относится к складу", 409, "category_mismatch")
            preview = {
                **payload,
                "warehouse_name": warehouse.name,
                "notice": "Срез источников фиксируется при запуске фонового расчёта.",
            }
            title = "Запустить расчёт пополнения"
            summary = "После подтверждения будет поставлена фоновая задача, заказ не создаётся."
        elif kind == "create_orders":
            lines = []
            for identifier in command.recommendation_ids:
                row = await self._calculations().recommendation(identifier)
                if row.status != "ready" or row.recommended_quantity <= 0 or row.order_id:
                    raise DomainError(
                        "Рекомендация недоступна для заказа", 409, "recommendation_blocked"
                    )
                if not row.supplier_id:
                    raise DomainError("Не указан поставщик", 409, "supplier_unavailable")
                supplier = await self._catalogs().get("suppliers", row.supplier_id)
                if not supplier.active:
                    raise DomainError("Поставщик неактивен", 409, "supplier_unavailable")
                lines.append(
                    {
                        "recommendation_id": str(row.id),
                        "sku": row.sku,
                        "name": row.name,
                        "quantity": str(row.recommended_quantity),
                        "unit": row.unit,
                        "supplier_id": str(row.supplier_id),
                        "supplier_name": supplier.name,
                        "warehouse_id": str(row.warehouse_id),
                    }
                )
            preview = {"lines": lines, "line_count": len(lines)}
            title = "Создать черновики заказов"
            summary = "Группировка по поставщику и складу. Без утверждения и отправки поставщику."
        else:
            package = await self._packages().get(command.package_id)
            if package.status != "validated" or not package.row_count:
                raise DomainError("Нужен проверенный непустой пакет", 409, "package_not_validated")
            preview = package_summary(self._packages().resource(package))
            title = "Применить пакет данных"
            summary = "Нормализованные факты попадут в рабочую базу; блокировки товаров сохранятся."
        return dict(kind=kind, title=title, summary=summary, payload=payload, preview=preview)

    async def confirm(self, kind: str, payload: dict, idempotency_key: str) -> dict:
        """Only the explicit, authenticated proposal-decision endpoint may call this."""
        await self.prepare(kind, payload)
        command = validated(PROPOSAL_ARGUMENTS, kind, payload)
        if kind == "create_orders":
            rows = await self._orders().create(
                CreateOrders(
                    recommendation_ids=command.recommendation_ids, idempotency_key=idempotency_key
                ),
                self.user.id,
            )
            return {"kind": kind, "orders": [order_summary(row) for row in rows]}
        # Infrastructure construction lives at this adapter boundary, never in the agent.
        from app.Domains.Jobs.dependencies import get_job_service

        jobs = get_job_service(self.session)
        if kind == "calculate":
            run = await self._calculations(jobs).create(
                CreateCalculation(
                    warehouse_id=command.warehouse_id,
                    category_id=command.category_id,
                    as_of=command.as_of,
                    parameters={"history_days": command.history_days},
                    idempotency_key=idempotency_key,
                ),
                self.user.id,
            )
            return {
                "kind": kind,
                "run_id": str(run.id),
                "status": run.status,
                "job_id": str(run.job_id) if run.job_id else None,
            }
        package = await self._packages(jobs).apply(command.package_id, self.user.id)
        return {
            "kind": kind,
            "package_id": str(package.id),
            "status": package.status,
            "job_id": str(package.job_id) if package.job_id else None,
        }
