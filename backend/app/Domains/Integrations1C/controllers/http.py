from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.services.exchange_service import ExchangeService
from app.Domains.Integrations1C.DTO.exchange import CreateSource, ExchangeCommand
from app.Domains.Integrations1C.resources.exchange import ExchangeResource, SourceResource
from app.Domains.Integrations1C.services.integration_service import IntegrationService

router = APIRouter(
    prefix="/integrations/1c",
    tags=["Обмен с 1С"],
    responses={
        401: {"description": "Требуется авторизация"},
        403: {"description": "Недостаточно прав"},
        404: {"description": "Источник не найден"},
        409: {"description": "Конфликт версии источника, строки или ключа пакета"},
        422: {"description": "Недопустимая строка или неразрешённая ссылка"},
    },
)
router.responses = {
    code: {**ERROR_RESPONSES.get(code, {}), **info} for code, info in router.responses.items()
}
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]


def get_service(session: Session):
    repository = DataRepository(session)
    return IntegrationService(repository, ExchangeService(repository))


Service = Annotated[IntegrationService, Depends(get_service)]


@router.get(
    "/sources", response_model=list[SourceResource], summary="Источники и актуальность данных"
)
async def sources(service: Service, _user=Depends(require_permission("integrations.read"))):
    return await service.sources()


@router.post(
    "/sources",
    response_model=SourceResource,
    status_code=201,
    summary="Зарегистрировать базу 1С или источник выгрузок",
    description="Регистрация не подключается к 1С. Адаптер базы отправляет нормализованные пакеты.",
)
async def create_source(
    command: CreateSource, service: Service, _user=Depends(require_permission("integrations.write"))
):
    return await service.create(command)


@router.post(
    "/sources/{source_id}/batches",
    response_model=ExchangeResource,
    summary="Атомарно применить пакет изменений 1С",
    description=(
        "Идемпотентный push-контракт, до 10000 строк. Повтор batch_key с тем же "
        "телом возвращает прежний результат. expected_revision защищает порядок. "
        "complete=false запрещает расчёт до финального согласованного пакета. "
        "Исправления требуют новой revision объекта; продажи отменяются status=cancelled. "
        "Пакет использует одну транзакцию, частичное применение исключено."
    ),
)
async def exchange(
    source_id: UUID,
    command: ExchangeCommand,
    service: Service,
    user=Depends(require_permission("integrations.write")),
):
    return await service.exchange(source_id, command, user.id)


@router.get(
    "/sources/{source_id}/batches",
    response_model=list[ExchangeResource],
    summary="Журнал успешно применённых пакетов",
    description="Отклонённые пакеты возвращают ошибку и не изменяют данные или курсор.",
)
async def logs(
    source_id: UUID,
    service: Service,
    _user=Depends(require_permission("integrations.read")),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await service.logs(source_id, limit, offset)
