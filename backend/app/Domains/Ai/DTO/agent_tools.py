"""Closed, bounded schemas for the assistant's internal tool protocol."""

from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

AssistantId = Literal["auto", "help", "data", "inventory", "demand", "procurement"]
ProposalKind = Literal[
    "calculate",
    "create_orders",
    "create_supplier_draft",
    "create_test_supplier_draft",
    "apply_package",
]


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
    source_id: UUID | None = None
    supplier_id: UUID | None = Field(default=None, description="Только для поиска товаров")


class SupplierArgs(Arguments):
    query: str = Field(min_length=1, max_length=500)


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


class SupplierDraftLineArgs(Arguments):
    product_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=20, decimal_places=6)
    request_text: str = Field(
        min_length=1,
        max_length=4000,
        description="Дословная цитата пользователя: название/артикул/код товара и количество",
    )


class CreateSupplierDraftArgs(Arguments):
    supplier_id: UUID
    supplier_request_text: str = Field(
        min_length=1,
        max_length=500,
        description="Дословное название или UUID поставщика из сообщения пользователя",
    )
    warehouse_id: UUID
    lines: list[SupplierDraftLineArgs] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_products(self):
        if len({line.product_id for line in self.lines}) != len(self.lines):
            raise ValueError("Повторяющиеся товары")
        return self


class CreateTestSupplierDraftArgs(Arguments):
    supplier_id: UUID
    supplier_request_text: str = Field(min_length=1, max_length=500)
    warehouse_id: UUID
    product_count: int = Field(ge=1, le=20, strict=True)
    test_request_text: str = Field(
        min_length=1,
        max_length=4000,
        description=(
            "Дословная просьба пользователя о тестовом заказе либо его короткое согласие "
            "(например, «Да, сделай») непосредственно на предложение тестового заказа"
        ),
    )
    selection_request_text: str = Field(
        min_length=1,
        max_length=4000,
        description="Дословная просьба выбрать любые N товаров, включая число N",
    )


READ_ARGUMENTS = {
    "search_help": HelpArgs,
    "search_catalog": CatalogArgs,
    "resolve_supplier": SupplierArgs,
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
    "create_supplier_draft": CreateSupplierDraftArgs,
    "create_test_supplier_draft": CreateTestSupplierDraftArgs,
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
        "resolve_supplier",
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
    "procurement": {"create_orders", "create_supplier_draft", "create_test_supplier_draft"},
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
    "procurement": "Ты специалист по закупкам. По готовым, ещё не распределённым рекомендациям "
    "предлагай черновик, сохраняя поставщика, склад и количество алгоритма. "
    "По названному поставщику готовь ручной черновик с товарами и количествами, "
    "которые явно назвал пользователь. Если назван только поставщик — сначала спроси товары "
    "и количества в чате. Никогда не заполняй их предположениями или рекомендациями. "
    "Исключение: если пользователь явно просит тестовый заказ и разрешает любые N товаров, "
    "система сама выберет N товаров этого поставщика и поставит по 1 единице каждого. "
    "Не проси артикулы для такого тестового заказа; покажи выбранные строки для подтверждения "
    "и явно назови заказ тестовым. Количество 1 — тестовое, не рекомендация к закупке. "
    "Учитывай продолжение диалога: «Да, сделай» в ответ на предложение тестового заказа "
    "уже означает согласие подготовить его. Не требуй повторять слово «тестовый». "
    "«5 любых товаров» и «любые 5 товаров» равнозначны. "
    "Все активные поставщики переданы в справочнике. Для неточного названия используй "
    "поиск поставщика и попроси пользователя назвать выбранного поставщика точно; "
    "не выбирай похожего без уточнения. Товары должны относиться к выбранному поставщику. "
    "Если складов несколько, уточни склад. Единственный склад источника можно использовать. "
    "Для обычного заказа, если товары и количества ещё не названы, задай уточнение. "
    "Не утверждай и не отправляй заказ. Предложение не является созданным заказом.",
}

PROFILE_PLANNING_PROMPTS = {
    "procurement": "Из рекомендаций используй create_orders; для ручного заказа "
    "create_supplier_draft. Неточное имя ищи через resolve_supplier. "
    "Для явного тестового заказа с разрешением выбрать любые N товаров используй "
    "create_test_supplier_draft: product_count=N, "
    "цитаты test_request_text и selection_request_text. "
    "Если пользователь ответил «Да, сделай» на предложение тестового заказа, "
    "test_request_text — дословное согласие; selection_request_text — его предыдущая "
    "просьба выбрать N любых товаров. Согласие разрешает подготовку предложения, "
    "а сохранение по-прежнему требует кнопки. "
    "Продукты и количество по 1 выбирает сервер, не вызывай для этого поиск каждого товара. "
    "Товары ищи с supplier_id, склады с source_id. Цитаты request_text должны дословно "
    "содержать товар (артикул/код/полное имя) и количество из сообщения пользователя. "
    "Если нужны уточнения, верни пустой план {}; вопрос пользователю будет сформулирован "
    "отдельным ответом после планирования.",
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
