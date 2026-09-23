import json
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES, DomainError
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.resources.imports import ImportDetail, ImportResource
from app.Domains.DataImports.services.import_service import ImportService
from app.Domains.DataImports.services.parser import MAX_BYTES

router = APIRouter(
    prefix="/imports",
    tags=["Источники данных"],
    responses={
        401: {"description": "Требуется авторизация"},
        403: {"description": "Недостаточно прав"},
        404: {"description": "Источник или импорт не найден"},
        409: {"description": "После проверки изменились данные источника; загрузите файл заново"},
        413: {"description": "Превышен лимит 25 МиБ или 10000 строк"},
        415: {"description": "Поддерживаются CSV UTF-8 и XLSX"},
        422: {"description": "Некорректный формат или строки данных"},
    },
)
router.responses = {
    code: {**ERROR_RESPONSES.get(code, {}), **info} for code, info in router.responses.items()
}
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]


def get_service(session: Session):
    return ImportService(DataRepository(session))


Service = Annotated[ImportService, Depends(get_service)]


class ApplyImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    complete: bool = Field(default=False, description="Это финальная часть согласованной выгрузки")


@router.post(
    "",
    response_model=ImportDetail,
    status_code=201,
    summary="Загрузить и проверить нормализованную выгрузку",
    description=(
        "Первый ряд каждого листа — заголовок; CSV UTF-8. column_mapping — JSON "
        "словарь исходная колонка → поле контракта DataRow. При сопоставлении "
        "несопоставленные колонки не сохраняются. Без сопоставления лишние поля "
        "отклоняются. До 10000 строк; ошибки лист/строка/поле. Preview до 20 строк. "
        "Импорт не меняет рабочие данные до apply. Даты ISO, остатки с часовым поясом."
    ),
)
async def upload(
    service: Service,
    source_id: Annotated[UUID, Form()],
    kind: Annotated[
        Literal[
            "categories",
            "suppliers",
            "warehouses",
            "products",
            "sales",
            "stocks",
            "inbound",
            "stockouts",
            "growth",
        ],
        Form(),
    ],
    file: Annotated[UploadFile, File(description="CSV UTF-8 или XLSX до 25 МиБ")],
    column_mapping: Annotated[str, Form()] = "{}",
    quantity_multiplier: Annotated[
        int,
        Form(description="Явное соглашение о знаке: -1 для исходящих движений с минусом"),
    ] = 1,
    user=Depends(require_permission("imports.write")),
):
    try:
        mapping = json.loads(column_mapping)
        if not isinstance(mapping, dict) or any(
            not isinstance(k, str) or not isinstance(v, str) for k, v in mapping.items()
        ):
            raise ValueError
    except (ValueError, TypeError) as exc:
        raise DomainError(
            "column_mapping должен быть JSON-словарём строк",
            status_code=422,
            code="invalid_mapping",
        ) from exc
    content = await file.read(MAX_BYTES + 1)
    return await service.stage(
        source_id,
        file.filename or "upload.csv",
        content,
        kind,
        mapping,
        quantity_multiplier,
        user.id,
    )


@router.get("", response_model=list[ImportResource], summary="История загрузок и ошибок")
async def imports(
    service: Service,
    _user=Depends(require_permission("imports.read")),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await service.list(limit, offset)


@router.get("/{batch_id}", response_model=ImportDetail, summary="Ошибки и предпросмотр импорта")
async def get_import(
    batch_id: UUID, service: Service, _user=Depends(require_permission("imports.read"))
):
    return await service.get(batch_id)


@router.post(
    "/{batch_id}/apply",
    response_model=ImportDetail,
    summary="Применить проверенный импорт целиком",
    description=(
        "Повтор после успешного применения безопасен. complete=true только для финальной части."
    ),
)
async def apply_import(
    batch_id: UUID,
    command: ApplyImport,
    service: Service,
    user=Depends(require_permission("imports.write")),
):
    return await service.apply(batch_id, user.id, command.complete)
