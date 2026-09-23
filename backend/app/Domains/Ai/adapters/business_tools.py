"""Permission-checked bridge to existing domains; no SQL or arbitrary execution."""

from pydantic import ValidationError

from app.core.errors import DomainError
from app.Domains.Ai.DTO.agent_tools import PROPOSAL_ARGUMENTS, READ_ARGUMENTS
from app.Domains.Ai.services.supplier_matching import quoted_by_user, supplier_matches
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
    "resolve_supplier": ("catalogs.read",),
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
    "create_supplier_draft": ("orders.write", "catalogs.read"),
    "create_test_supplier_draft": ("orders.write", "catalogs.read"),
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

    def can_use_supplier_context(self):
        return self.user.has_permission("catalogs.read")

    async def supplier_directory(self):
        """Every active supplier, using only the public identity projection, without page loss."""
        self._require(("catalogs.read",))
        result, offset = [], 0
        while True:
            rows = await self._catalogs().list("suppliers", 200, offset, None, True)
            result.extend(select(row, "id", "name", "source_id") for row in rows)
            if len(rows) < 200:
                return result
            offset += len(rows)

    async def validate_draft_warehouse(self, command, user_messages, selected_warehouse_id=None):
        self._require(WRITE_PERMISSIONS["create_supplier_draft"])
        catalogs = self._catalogs()
        warehouse = await catalogs.get("warehouses", command.warehouse_id)
        if str(warehouse.id) != str(selected_warehouse_id) and not quoted_by_user(
            str(warehouse.id), user_messages
        ):
            named = quoted_by_user(warehouse.name, user_messages)
            warehouses = await catalogs.list(
                "warehouses",
                2,
                0,
                warehouse.name if named else None,
                True,
                warehouse.source_id,
            )
            if len(warehouses) != 1 or warehouses[0].id != command.warehouse_id:
                return "Укажите склад для заказа; при совпадении названий используйте UUID склада."
        return None

    async def validate_draft_selection(
        self, command, preview, user_messages, selected_warehouse_id=None
    ):
        """Reject arbitrary first matches even when the model observed several valid UUIDs."""
        issue = await self.validate_draft_warehouse(command, user_messages, selected_warehouse_id)
        if issue:
            return issue
        catalogs = self._catalogs()
        for line, product in zip(command.lines, preview["lines"], strict=True):
            if quoted_by_user(str(line.product_id), [line.request_text]):
                continue
            aliases = [str(product.get(key, "")) for key in ("sku", "code", "name")]
            exact_identity = False
            for alias in aliases:
                if not alias or not quoted_by_user(alias, [line.request_text]):
                    continue
                matches, offset = [], 0
                while True:
                    rows = await catalogs.list(
                        "products",
                        200,
                        offset,
                        alias,
                        True,
                        None,
                        command.supplier_id,
                    )
                    matches.extend(
                        row
                        for row in rows
                        if any(
                            str(getattr(row, key, "")).casefold() == alias.casefold()
                            for key in ("sku", "code", "name")
                        )
                    )
                    if len(rows) < 200:
                        break
                    offset += len(rows)
                if len(matches) == 1 and matches[0].id == line.product_id:
                    exact_identity = True
                    break
            if not exact_identity:
                return (
                    f"Уточните товар «{product['name']}»: название или артикул неоднозначны. "
                    "Укажите уникальный код 1С или UUID товара и количество."
                )
        return None

    async def _test_draft(self, command, idempotency_key):
        from app.Domains.Procurement.DTO.order import CreateSupplierDraft

        catalogs = self._catalogs()
        supplier = await catalogs.get("suppliers", command.supplier_id)
        warehouse = await catalogs.get("warehouses", command.warehouse_id)
        if not supplier.active or not warehouse.active or supplier.source_id != warehouse.source_id:
            raise DomainError(
                "Выберите активного поставщика и склад одной базы 1С", 409, "test_source_mismatch"
            )
        # Catalog order is name + UUID: stable selection, scoped by supplier AND source.
        products, offset = [], 0
        while len(products) < command.product_count:
            page = await catalogs.list(
                "products",
                200,
                offset,
                None,
                True,
                supplier.source_id,
                command.supplier_id,
            )
            products.extend(
                row
                for row in page
                if row.unit
                and row.unit.strip().casefold()
                not in {
                    "",
                    "не определена",
                    "не определено",
                    "неизвестно",
                    "unknown",
                    "-",
                    "—",
                }
            )
            if len(page) < 200:
                break
            offset += len(page)
        products = products[: command.product_count]
        if len(products) != command.product_count:
            raise DomainError(
                f"У поставщика доступно {len(products)} товаров с известной единицей измерения. "
                "Уточните число позиций или единицы товаров в справочнике.",
                409,
                "test_products_insufficient",
            )
        return CreateSupplierDraft(
            supplier_id=command.supplier_id,
            warehouse_id=command.warehouse_id,
            lines=[{"product_id": row.id, "quantity": "1"} for row in products],
            comment="[ТЕСТОВЫЙ ЗАКАЗ] Выбраны товары поставщика, по 1 единице каждого.",
            reason="Тестовый выбор по просьбе пользователя; количество 1 не является прогнозом.",
            idempotency_key=idempotency_key,
        )

    async def execute_read(self, name: str, args: dict) -> dict:
        command = validated(READ_ARGUMENTS, name, args)
        if name not in READ_PERMISSIONS:
            raise DomainError("Инструмент не разрешён", 422, "unknown_agent_tool")
        self._require(READ_PERMISSIONS[name])
        if name == "resolve_supplier":
            return supplier_matches(command.query, await self.supplier_directory())
        if name == "search_catalog":
            rows = await self._catalogs().list(
                command.kind,
                command.limit,
                command.offset,
                command.query,
                True,
                command.source_id,
                command.supplier_id,
            )
            return {
                "items": [
                    select(
                        row,
                        "id",
                        "source_id",
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
        elif kind in {"create_supplier_draft", "create_test_supplier_draft"}:
            from app.Domains.Procurement.DTO.order import CreateSupplierDraft

            is_test = kind == "create_test_supplier_draft"
            draft = (
                await self._test_draft(command, "preview")
                if is_test
                else CreateSupplierDraft(
                    supplier_id=command.supplier_id,
                    warehouse_id=command.warehouse_id,
                    lines=[line.model_dump(exclude={"request_text"}) for line in command.lines],
                    idempotency_key="preview",
                )
            )
            validated_draft = await self._orders().preview_supplier_draft(draft)
            preview = {
                "supplier_name": validated_draft["supplier"]["name"],
                "warehouse_name": validated_draft["warehouse"]["name"],
                "lines": validated_draft["lines"],
                "line_count": len(validated_draft["lines"]),
                "notice": "Товары и количества указаны пользователем. Это не расчёт потребности.",
            }
            title = "Создать черновик заказа поставщику"
            summary = "После создания проверьте заказ: его можно утвердить или удалить."
            if is_test:
                preview["is_test"] = True
                preview["notice"] = (
                    "Тестовый заказ: система выбрала товары поставщика, по 1 единице каждого. "
                    "Это не прогноз потребности."
                )
                title = "Создать тестовый черновик заказа"
                summary = "Тестовые позиции и количества. Проверьте строки перед созданием."
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
        if kind == "create_test_supplier_draft":
            draft = await self._test_draft(command, idempotency_key)
            row = await self._orders().create_supplier_draft(draft, self.user.id)
            return {"kind": kind, "orders": [order_summary(row)]}
        if kind == "create_supplier_draft":
            from app.Domains.Procurement.DTO.order import CreateSupplierDraft

            row = await self._orders().create_supplier_draft(
                CreateSupplierDraft(
                    supplier_id=command.supplier_id,
                    warehouse_id=command.warehouse_id,
                    lines=[line.model_dump(exclude={"request_text"}) for line in command.lines],
                    idempotency_key=idempotency_key,
                ),
                self.user.id,
            )
            return {"kind": kind, "orders": [order_summary(row)]}
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
