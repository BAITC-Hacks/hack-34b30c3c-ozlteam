import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES, DomainError
from app.Domains.DataImports.DTO.packages import PackageOptions
from app.Domains.DataImports.repositories.package_repository import PackageRepository
from app.Domains.DataImports.resources.packages import PackageItems, PackagePage, PackageResource
from app.Domains.DataImports.services.package_service import MAX_FILE_BYTES, PackageService
from app.Domains.Files.dependencies import get_file_storage
from app.Domains.Jobs.dependencies import get_job_service
from app.Domains.Jobs.services.job_service import JobService

router = APIRouter(
    prefix="/imports/packages",
    tags=["Пакеты отчётов 1С"],
    responses={
        **ERROR_RESPONSES,
        413: {**ERROR_RESPONSES[422], "description": "Превышен размер пакета или книги"},
        415: {**ERROR_RESPONSES[422], "description": "Профиль принимает только XLSX"},
    },
)


def get_package_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
    jobs: Annotated[JobService, Depends(get_job_service)],
) -> PackageService:
    return PackageService(PackageRepository(session), get_file_storage(), jobs)


Service = Annotated[PackageService, Depends(get_package_service)]


@router.post(
    "",
    response_model=PackageResource,
    status_code=202,
    summary="Загрузить пакет тестовых отчётов IEK / Systeme и начать проверку",
    description=(
        "Multipart: 1–20 исходных книг XLSX до 25 МиБ каждая; общий HTTP-лимит задаёт сервер. "
        "options — JSON объекта PackageOptions: дата среза, начало истории, сопоставления складов, "
        "явные тестовые lead time/MOQ/единицы. Без source_id используется тестовый файловый "
        "источник Электрокомплекта (создаётся один раз); name — подпись пакета. "
        "Повтор тех же "
        "файлов/опций/источника возвращает прежний пакет. Обработка асинхронна: опрашивайте "
        "GET пакета или jobs/{job_id}. Рабочие данные не меняются до apply. Неизвестные факты "
        "сохраняются как ошибки/ограничения, автоматическая отправка заказа отсутствует."
    ),
)
async def upload_package(
    service: Service,
    files: Annotated[
        list[UploadFile], File(description="Исходные XLSX, имена сохранены для выбора профиля")
    ],
    options: Annotated[
        str, Form(description="JSON PackageOptions; значения не подтверждаются автоматически")
    ] = "{}",
    source_id: Annotated[UUID | None, Form()] = None,
    name: Annotated[
        str, Form(min_length=1, max_length=200)
    ] = "Тестовые выгрузки 1С Электрокомплект",
    user=Depends(require_permission("imports.write")),
):
    try:
        command = PackageOptions.model_validate(json.loads(options))
    except (ValueError, TypeError, ValidationError) as exc:
        raise DomainError(
            "options должен соответствовать схеме PackageOptions", 422, "invalid_package_options"
        ) from exc
    contents = [
        (file.filename or "unknown.xlsx", await file.read(MAX_FILE_BYTES + 1)) for file in files
    ]
    return await service.stage(contents, command, source_id, name, user.id)


@router.get("", response_model=PackagePage, summary="История пакетов исходных отчётов")
async def list_packages(
    service: Service,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _user=Depends(require_permission("imports.read")),
):
    return await service.list(limit, offset)


@router.get(
    "/{package_id}",
    response_model=PackageResource,
    summary="Прогресс, результаты проверки и готовность пакета",
    description=(
        "Компактная сводка без исходных строк. summary.by_status — покрытие товаров; "
        "controls — число контрольных записей по виду. processed_rows — применённые строки, "
        "row_count — нормализованные строки."
    ),
)
async def get_package(
    package_id: UUID, service: Service, _user=Depends(require_permission("imports.read"))
):
    return service.resource(await service.get(package_id))


@router.get(
    "/{package_id}/issues",
    response_model=PackageItems,
    summary="Ошибки и ограничения со ссылками на исходные ячейки",
)
async def package_issues(
    package_id: UUID,
    service: Service,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200),
    status: str | None = Query(None, description="severity: error / warning"),
    supplier: str | None = Query(None),
    _user=Depends(require_permission("imports.read")),
):
    return await service.items(package_id, "issues", limit, offset, q, status, supplier)


@router.get(
    "/{package_id}/products",
    response_model=PackageItems,
    summary="Готовность объединённого каталога: ready / limited / blocked",
)
async def package_products(
    package_id: UUID,
    service: Service,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200),
    status: str | None = Query(None),
    supplier: str | None = Query(None),
    _user=Depends(require_permission("imports.read")),
):
    return await service.items(package_id, "products", limit, offset, q, status, supplier)


@router.post(
    "/{package_id}/apply",
    response_model=PackageResource,
    status_code=202,
    summary="Применить проверенный пакет в фоне",
    description=(
        "Применяются только нормализованные факты; проблемные товары сохраняют блокировку заказа. "
        "Порции атомарны, источник неполон до последней порции. Повтор безопасен. "
        "Чужое изменение источника останавливает применение с конфликтом; "
        "данные не перезаписываются молча."
    ),
)
async def apply_package(
    package_id: UUID, service: Service, user=Depends(require_permission("imports.write"))
):
    return await service.apply(package_id, user.id)


@router.post(
    "/{package_id}/retry",
    response_model=PackageResource,
    status_code=202,
    summary="Повторить ошибочную проверку или продолжить применение",
    description=(
        "Применение продолжается с последней сохранённой порции. "
        "Конфликт версии требует нового согласованного пакета, retry не отменяет защиту версий."
    ),
)
async def retry_package(
    package_id: UUID, service: Service, user=Depends(require_permission("imports.write"))
):
    return await service.retry(package_id, user.id)
