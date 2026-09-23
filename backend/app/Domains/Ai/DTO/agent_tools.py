"""Closed, bounded schemas for the assistant's internal tool protocol."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

AssistantId = Literal["auto", "help", "data", "inventory", "demand", "procurement"]
ProposalKind = Literal["calculate", "create_orders", "apply_package"]


class Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class HelpArgs(Arguments):
    query: str = Field(min_length=1, max_length=500)


class PageArgs(Arguments):
    limit: int = Field(default=10, ge=1, le=20, strict=True)
    offset: int = Field(default=0, ge=0, le=10000, strict=True)


class CatalogArgs(PageArgs):
    kind: Literal["products", "warehouses", "suppliers", "categories"] = "products"
    query: str | None = Field(default=None, max_length=200)


class WarehouseArgs(Arguments):
    warehouse_id: UUID | None = None


class InventoryArgs(PageArgs):
    warehouse_id: UUID | None = None
    product_id: UUID | None = None


class RunsArgs(PageArgs):
    warehouse_id: UUID | None = None


class IdArgs(Arguments):
    id: UUID


class RecommendationsArgs(PageArgs):
    run_id: UUID
    supplier_id: UUID | None = None
    urgency: Literal["none", "normal", "high", "critical"] | None = None


class OrdersArgs(PageArgs):
    status: Literal["draft", "approved"] | None = None
    warehouse_id: UUID | None = None
    supplier_id: UUID | None = None


class CalculateArgs(Arguments):
    warehouse_id: UUID
    category_id: UUID | None = None
    as_of: date
    history_days: int = Field(default=1095, ge=28, le=3650, strict=True)


class CreateOrdersArgs(Arguments):
    recommendation_ids: list[UUID] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_ids(self):
        if len(set(self.recommendation_ids)) != len(self.recommendation_ids):
            raise ValueError("Повторяющиеся рекомендации")
        return self


class ApplyPackageArgs(Arguments):
    package_id: UUID


READ_ARGUMENTS = {
    "search_help": HelpArgs,
    "search_catalog": CatalogArgs,
    "get_overview": WarehouseArgs,
    "get_stock": InventoryArgs,
    "get_inbound": InventoryArgs,
    "list_runs": RunsArgs,
    "get_run": IdArgs,
    "list_recommendations": RecommendationsArgs,
    "get_recommendation": IdArgs,
    "list_orders": OrdersArgs,
    "get_order": IdArgs,
    "list_packages": PageArgs,
    "get_package": IdArgs,
}
PROPOSAL_ARGUMENTS = {
    "calculate": CalculateArgs,
    "create_orders": CreateOrdersArgs,
    "apply_package": ApplyPackageArgs,
}

# The selected helper's capabilities are enforced in Python, not only in its prompt.
PROFILE_TOOLS = {
    "help": {"search_help"},
    "data": {"search_help", "search_catalog", "list_packages", "get_package"},
    "inventory": {"search_help", "search_catalog", "get_stock", "get_inbound"},
    "demand": {
        "search_help",
        "search_catalog",
        "get_overview",
        "list_runs",
        "get_run",
        "list_recommendations",
        "get_recommendation",
        "get_stock",
        "get_inbound",
    },
    "procurement": {
        "search_help",
        "search_catalog",
        "list_runs",
        "get_run",
        "list_recommendations",
        "get_recommendation",
        "list_orders",
        "get_order",
    },
}
PROFILE_PROPOSALS = {
    "help": set(),
    "data": {"apply_package"},
    "inventory": set(),
    "demand": {"calculate"},
    "procurement": {"create_orders"},
}
PROFILE_PROMPTS = {
    "help": "Ты справочник системы. Объясняй интерфейс и правила по найденным инструкциям, "
    "давай ссылки. Не заявляй о состоянии конкретного склада или заказа без данных.",
    "data": "Ты специалист по качеству данных 1С. Читай сводку пакета и объясняй готовность, "
    "ограничения и ошибки. Не придумывай UUID, клиента, знак операции или дни stockout. "
    "Применение проверенного пакета можно только предложить для подтверждения.",
    "inventory": "Ты специалист по запасам. Различай остаток, резерв и поступление с ETA; "
    "остаток quantity включает reserved. Показывай дату среза. Не называй заказ приходом.",
    "demand": "Ты аналитик спроса. Используй сохранённый детерминированный расчёт и breakdown. "
    "Не вычисляй и не выдумывай рекомендуемые количества сам. Объясняй сезонность, выбросы, "
    "stockout и ограничения. Новый расчёт только предложи для подтверждения.",
    "procurement": "Ты специалист по закупкам. Готовь черновики только из готовых, ещё не "
    "распределённых рекомендаций. Сохраняй supplier/warehouse и количество алгоритма. "
    "Не утверждай и не отправляй заказ. Предложение не является созданным заказом.",
}


class Route(Arguments):
    assistant_id: Literal["help", "data", "inventory", "demand", "procurement"]


class ToolCall(Arguments):
    name: str = Field(min_length=1, max_length=60)
    arguments: dict = Field(default_factory=dict)


class ProposalPlan(Arguments):
    kind: ProposalKind
    payload: dict


class Step(Arguments):
    tool: ToolCall | None = None
    proposal: ProposalPlan | None = None

    @model_validator(mode="after")
    def one_action(self):
        if self.tool is not None and self.proposal is not None:
            raise ValueError("Только одно действие за шаг")
        return self
