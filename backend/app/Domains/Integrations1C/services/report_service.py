import asyncio
import hashlib
import json
import math
import os
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

import httpx
from pydantic import ValidationError

from app.core.errors import DomainError
from app.Domains.DataImports.DTO.rows import ROW_ADAPTER
from app.Domains.DataImports.services.parser import MAX_BYTES, MAX_ROWS
from app.Domains.Integrations1C.DTO.reports import ROW_MODELS, url_origin
from app.Domains.Integrations1C.resources.reports import ReportKindResource, ReportResource

KIND_TITLES = {
    "categories": ("Категории", "Категории и политика пополнения"),
    "suppliers": ("Поставщики", "Справочник любых поставщиков"),
    "warehouses": ("Склады", "Собственные склады Электрокомплекта"),
    "products": ("Номенклатура", "Товары, единицы, поставщики, MOQ, кратность и срок поставки"),
    "sales": ("Отгрузки", "Строки отгрузок клиентам, возвраты и отмены"),
    "stocks": ("Остатки", "Снимки физического остатка и резерва с датой и часовым поясом"),
    "inbound": ("Товары в пути", "Подтверждённые поставки и ожидаемые даты прихода"),
    "stockouts": (
        "Отсутствие товара",
        "Подтверждённые интервалы отсутствия; месячный ноль не доказывает интервал",
    ),
    "growth": ("Прогноз прироста", "Согласованный прирост по товару или категории"),
}
FIELD_LABELS = {
    "external_id": "Стабильный ID объекта / строки",
    "revision": "Версия объекта (целое число ≥ 1)",
    "source_updated_at": "Изменён в 1С",
    "name": "Наименование",
    "active": "Активен",
    "review_days": "Период пересмотра, дней",
    "safety_days": "Страховой запас, дней",
    "organization_external_id": "ID организации",
    "sku": "Артикул",
    "code": "Код 1С",
    "category_external_id": "ID категории",
    "supplier_external_id": "ID поставщика",
    "characteristic_external_id": "ID характеристики",
    "unit": "Базовая единица",
    "pack_size": "Кратность",
    "min_order_qty": "Минимальный заказ",
    "lead_time_days": "Срок поставки, дней",
    "data_quality": "Готовность данных",
    "product_external_id": "ID товара",
    "warehouse_external_id": "ID склада",
    "date": "Дата отгрузки",
    "document_date": "Дата и время документа",
    "document_id": "ID документа",
    "line_id": "ID строки документа",
    "quantity": "Количество в базовой единице",
    "price": "Цена",
    "client_id": "Обезличенный ID клиента",
    "status": "Статус",
    "as_of": "Дата и время снимка",
    "reserved": "Резерв",
    "expected_date": "Ожидаемая дата прихода",
    "start": "Начало периода",
    "end": "Конец периода",
    "rate": "Прирост (0.1 = 10%)",
    "mode": "Режим прогноза",
}
MISSING = object()


def report_kinds():
    result = []
    for kind, model in ROW_MODELS.items():
        fields = []
        for name, schema in model.model_json_schema()["properties"].items():
            if name == "kind":
                continue
            variants = [s for s in schema.get("anyOf", [schema]) if s.get("type") != "null"]
            selected = next((s for s in variants if s.get("type") == "number"), variants[0])
            fields.append(
                dict(
                    name=name,
                    label=FIELD_LABELS.get(name, name),
                    required=model.model_fields[name].is_required(),
                    type=selected.get("format", selected.get("type", "string")),
                )
            )
        title, description = KIND_TITLES[kind]
        result.append(
            ReportKindResource(kind=kind, title=title, description=description, fields=fields)
        )
    return result


def lookup(value, path):
    if not path:
        return value
    if not isinstance(value, dict):
        return MISSING
    if path in value:
        return value[path]
    first, separator, remaining = path.partition(".")
    return lookup(value.get(first, MISSING), remaining) if separator else value.get(first, MISSING)


def json_metadata(value):
    """JSON metadata uses JSON numbers; accounting quantities retain exact Decimal values."""
    if isinstance(value, Decimal):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("Metadata number out of range")
        return number
    if isinstance(value, dict):
        return {key: json_metadata(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_metadata(item) for item in value]
    return value


def extract_rows(payload, profile):
    envelope = payload
    for part in [None, *profile.items_path.split(".")]:
        if part is not None:
            envelope = envelope.get(part) if isinstance(envelope, dict) else None
        if isinstance(envelope, dict) and any(
            envelope.get(key) for key in ("@odata.nextLink", "odata.nextLink", "__next", "nextLink")
        ):
            raise DomainError(
                "Ответ содержит следующую страницу; настройте полный пакет до 10000 строк",
                code="incomplete_rest_page",
            )
    items = lookup(payload, profile.items_path)
    if not isinstance(items, list):
        raise DomainError(
            "По указанному пути не найден JSON-массив строк", code="invalid_rest_payload"
        )
    if len(items) > MAX_ROWS:
        raise DomainError("Не более 10000 строк в пакете", status_code=413, code="too_many_rows")
    rows, errors = [], []
    for number, item in enumerate(items, 1):

        def issue(column, message):
            errors.append(dict(sheet="REST", row=number, column=column, message=message))

        if not isinstance(item, dict):
            issue(None, "Строка должна быть JSON-объектом")
            continue
        if profile.column_mapping:
            record = {target: lookup(item, path) for path, target in profile.column_mapping.items()}
            missing = [key for key, value in record.items() if value is MISSING]
            for key in missing:
                issue(key, "В ответе отсутствует сопоставленное исходное поле")
            if missing:
                continue
        else:
            record = dict(item)
        if record.get("kind", profile.kind) != profile.kind:
            issue("kind", "Вид строки не соответствует выбранному виду данных")
            continue
        record["kind"] = profile.kind
        try:
            if "data_quality" in record:
                record["data_quality"] = json_metadata(record["data_quality"])
            if "quantity" in record and profile.quantity_multiplier == -1:
                record["quantity"] = str(-Decimal(str(record["quantity"])))
            row = ROW_ADAPTER.validate_python(record)
            rows.append(dict(sheet="REST", row=number, data=row.model_dump(mode="json")))
        except ValidationError as exc:
            for error in exc.errors(include_input=False, include_context=False):
                issue(str(error["loc"][-1]) if error["loc"] else None, error["msg"])
        except InvalidOperation:
            issue("quantity", "Количество не является числом")
        except (ValueError, RecursionError):
            issue("data_quality", "Метаданные содержат недопустимое число или структуру")
    if not items:
        errors.append(dict(sheet="REST", row=0, column=None, message="Ответ не содержит данных"))
    return rows, errors, len(items)


async def fetch_report(profile, allowed_origins, transport=None):
    try:
        origin = url_origin(profile.url)
        allowed = set()
        for value in allowed_origins.split(","):
            if not value.strip():
                continue
            value = value.strip()
            parsed = urlsplit(value)
            if parsed.path not in ("", "/") or parsed.query:
                raise ValueError
            allowed.add(url_origin(value))
    except ValueError as exc:
        raise DomainError(
            "Проверьте серверную настройку разрешённых адресов 1С", code="invalid_rest_origin"
        ) from exc
    if origin not in allowed:
        raise DomainError(
            "Адрес 1С не разрешён сервером. Настройте ONEC_ALLOWED_ORIGINS",
            code="rest_origin_not_allowed",
        )
    headers = {"Accept": "application/json", "Accept-Encoding": "identity"}
    if profile.auth_env:
        secret = os.environ.get(profile.auth_env)
        if not secret or any(ord(char) < 32 or ord(char) > 126 for char in secret):
            raise DomainError(
                "Серверная переменная авторизации не настроена или имеет неверный формат",
                code="rest_auth_not_configured",
            )
        headers["Authorization"] = secret
    content = bytearray()
    try:
        async with (
            asyncio.timeout(35),
            httpx.AsyncClient(
                timeout=httpx.Timeout(20, connect=5),
                follow_redirects=False,
                trust_env=False,
                transport=transport,
            ) as client,
        ):
            async with client.stream("GET", profile.url, headers=headers) as response:
                if response.status_code != 200:
                    raise DomainError(
                        "1С не вернула успешный ответ HTTP 200; проверьте адрес и доступ",
                        status_code=502,
                        code="rest_upstream_error",
                    )
                if response.headers.get("content-encoding", "identity").lower() != "identity":
                    raise DomainError(
                        "Настройте несжатый JSON-ответ 1С",
                        status_code=502,
                        code="rest_compression_unsupported",
                    )
                async for chunk in response.aiter_bytes():
                    if len(content) + len(chunk) > MAX_BYTES:
                        raise DomainError(
                            "Ответ 1С превышает 25 МиБ",
                            status_code=413,
                            code="rest_response_too_large",
                        )
                    content.extend(chunk)
    except (httpx.HTTPError, TimeoutError) as exc:
        raise DomainError(
            "Не удалось получить отчёт 1С; проверьте соединение и доступ",
            status_code=502,
            code="rest_connection_error",
        ) from exc
    try:
        payload = json.loads(content, parse_float=Decimal, parse_constant=reject_json_constant)
    except (ValueError, UnicodeDecodeError, RecursionError, InvalidOperation) as exc:
        raise DomainError(
            "Ответ 1С не является корректным JSON", status_code=502, code="invalid_rest_json"
        ) from exc
    return payload, hashlib.sha256(content).hexdigest()


def reject_json_constant(value):
    raise ValueError("Non-finite JSON number")


class ReportService:
    def __init__(self, repository, imports, allowed_origins, transport=None):
        self.repository = repository
        self.imports = imports
        self.allowed_origins = allowed_origins
        self.transport = transport

    async def list(self, source_id):
        await self.require_source(source_id)
        return [ReportResource.model_validate(row) for row in await self.repository.list(source_id)]

    async def require_source(self, source_id):
        if not await self.repository.source_exists(source_id):
            raise DomainError("Источник не найден", status_code=404, code="source_not_found")

    async def get(self, report_id):
        report = await self.repository.get(report_id)
        if report is None:
            raise DomainError("Профиль отчёта не найден", status_code=404, code="report_not_found")
        return report

    async def create(self, source_id, command):
        await self.require_source(source_id)
        return ReportResource.model_validate(
            await self.repository.save(None, dict(source_id=source_id, **command.model_dump()))
        )

    async def update(self, report_id, command):
        report = await self.get(report_id)
        return ReportResource.model_validate(
            await self.repository.save(report, command.model_dump())
        )

    async def preview(self, report_id, user_id):
        report = await self.get(report_id)
        payload, content_hash = await fetch_report(report, self.allowed_origins, self.transport)
        rows, errors, count = extract_rows(payload, report)
        return await self.imports.stage_rows(
            report.source_id,
            f"REST-{report.id}.json",
            report.kind,
            rows,
            errors,
            count,
            content_hash,
            user_id,
        )
