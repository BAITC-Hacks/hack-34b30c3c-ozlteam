from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES, ErrorResponse
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.resources.imports import ImportDetail
from app.Domains.DataImports.services.import_service import ImportService
from app.Domains.Integrations1C.DTO.reports import SaveReport
from app.Domains.Integrations1C.repositories.report_repository import ReportRepository
from app.Domains.Integrations1C.resources.reports import ReportKindResource, ReportResource
from app.Domains.Integrations1C.services.report_service import ReportService, report_kinds

router = APIRouter(prefix="/integrations/1c", tags=["REST-отчёты 1С"], responses=ERROR_RESPONSES)
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]


def get_report_service(session: Session):
    return ReportService(
        ReportRepository(session),
        ImportService(DataRepository(session)),
        get_settings().onec_allowed_origins,
    )


Service = Annotated[ReportService, Depends(get_report_service)]


@router.get(
    "/report-kinds",
    response_model=list[ReportKindResource],
    summary="Виды отчётов и поля нормализованного контракта",
)
async def kinds(_user=Depends(require_permission("integrations.read"))):
    return report_kinds()


@router.get(
    "/sources/{source_id}/reports",
    response_model=list[ReportResource],
    summary="Сохранённые настройки REST-отчётов базы 1С",
)
async def reports(
    source_id: UUID, service: Service, _user=Depends(require_permission("integrations.read"))
):
    return await service.list(source_id)


@router.post(
    "/sources/{source_id}/reports",
    response_model=ReportResource,
    status_code=201,
    summary="Сохранить профиль REST-отчёта и сопоставление полей",
    description=(
        "Профиль хранится в PostgreSQL; регистрация не обращается к 1С. "
        "Секреты — только в окружении сервера. Пустое сопоставление ожидает "
        "уже нормализованные имена полей."
    ),
)
async def create_report(
    source_id: UUID,
    command: SaveReport,
    service: Service,
    _user=Depends(require_permission("integrations.write")),
):
    return await service.create(source_id, command)


@router.put(
    "/reports/{report_id}",
    response_model=ReportResource,
    summary="Полностью заменить настройки REST-отчёта",
)
async def update_report(
    report_id: UUID,
    command: SaveReport,
    service: Service,
    _user=Depends(require_permission("integrations.write")),
):
    return await service.update(report_id, command)


@router.post(
    "/reports/{report_id}/preview",
    response_model=ImportDetail,
    summary="Получить REST-отчёт, проверить и сохранить предварительный импорт",
    description=(
        "Нужны integrations.write и imports.write. GET JSON до 25 МиБ / 10000 строк, "
        "35 секунд. Только ONEC_ALLOWED_ORIGINS; перенаправления и неполные страницы запрещены. "
        "В staging сохраняются нормализованные строки и ошибки без исходного ответа. "
        "Рабочие данные меняет отдельный POST /imports/{id}/apply. Даты ISO, "
        "моменты с часовым поясом; ID и версии обязательны из источника."
    ),
    responses={
        413: {"model": ErrorResponse, "description": "Превышен размер или число строк"},
        502: {
            "model": ErrorResponse,
            "description": "Недоступен источник или ответ не поддерживается",
        },
    },
)
async def preview_report(
    report_id: UUID,
    service: Service,
    user=Depends(require_permission("imports.write")),
    _integration_user=Depends(require_permission("integrations.write")),
):
    return await service.preview(report_id, user.id)
