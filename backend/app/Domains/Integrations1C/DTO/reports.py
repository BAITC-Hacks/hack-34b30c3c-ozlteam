from typing import Literal
from urllib.parse import parse_qsl, urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.Domains.DataImports.DTO.rows import (
    CategoryRow,
    GrowthRow,
    InboundRow,
    ProductRow,
    SaleRow,
    StockoutRow,
    StockRow,
    SupplierRow,
    WarehouseRow,
)

ROW_MODELS = {
    "categories": CategoryRow,
    "suppliers": SupplierRow,
    "warehouses": WarehouseRow,
    "products": ProductRow,
    "sales": SaleRow,
    "stocks": StockRow,
    "inbound": InboundRow,
    "stockouts": StockoutRow,
    "growth": GrowthRow,
}
ReportKind = Literal[
    "categories",
    "suppliers",
    "warehouses",
    "products",
    "sales",
    "stocks",
    "inbound",
    "stockouts",
    "growth",
]


def url_origin(value: str) -> tuple[str, str, int]:
    """Use the same canonical origin for profile validation and the outbound allowlist."""
    parsed = urlsplit(value)
    if (
        parsed.scheme not in ("https", "http")
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or any(ord(char) <= 32 for char in value)
        or "\\" in value
    ):
        raise ValueError("Укажите HTTP(S) URL без логина, пароля, пробелов и фрагмента")
    return (
        parsed.scheme,
        parsed.hostname.lower(),
        parsed.port or (443 if parsed.scheme == "https" else 80),
    )


class SaveReport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=200)
    kind: ReportKind
    url: str = Field(min_length=1, max_length=2048, description="GET URL без секретов")
    items_path: str = Field(
        default="",
        max_length=200,
        description="Путь к массиву: value или d.results; пусто — корневой массив",
    )
    column_mapping: dict[str, str] = Field(
        default_factory=dict,
        max_length=60,
        description="Исходный путь поля → поле нашего контракта; пусто — имена уже совпадают",
    )
    quantity_multiplier: Literal[1, -1] = Field(
        default=1, description="Явное соглашение о знаке количества"
    )
    auth_env: str | None = Field(
        default=None,
        max_length=100,
        pattern=r"^ONEC_AUTH_[A-Z0-9_]+$",
        description=(
            "Имя серверной переменной с Authorization, например ONEC_AUTH_EKT; не значение секрета"
        ),
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        url_origin(value)
        if any(
            any(
                part in key.lower()
                for part in ("password", "secret", "token", "api_key", "apikey", "authorization")
            )
            for key, _ in parse_qsl(urlsplit(value).query)
        ):
            raise ValueError("Секреты в URL запрещены; используйте auth_env")
        return value

    @model_validator(mode="after")
    def validate_mapping(self):
        fields = set(ROW_MODELS[self.kind].model_fields) - {"kind"}
        if set(self.column_mapping.values()) - fields:
            raise ValueError("Сопоставление содержит неизвестное целевое поле")
        if len(set(self.column_mapping.values())) != len(self.column_mapping):
            raise ValueError("Несколько исходных полей сопоставлены одному целевому")
        for path in [self.items_path, *self.column_mapping]:
            if path and (len(path) > 200 or any(not part.strip() for part in path.split("."))):
                raise ValueError("Путь состоит из имён полей через точку")
        if "" in self.column_mapping:
            raise ValueError("Исходное поле не может быть пустым")
        return self
