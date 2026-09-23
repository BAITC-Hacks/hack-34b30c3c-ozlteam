from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES
from app.Domains.Catalogs.repositories.catalog_repository import CatalogRepository
from app.Domains.Catalogs.resources.catalog import CatalogOutput
from app.Domains.Catalogs.services.catalog_service import CatalogService
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.services.exchange_service import ExchangeService
from app.Domains.Integrations1C.DTO.exchange import CatalogCommand

router = APIRouter(
    prefix="/catalogs",
    tags=["Справочники"],
    responses={
        401: {"description": "Требуется авторизация"},
        403: {"description": "Недостаточно прав"},
        404: {"description": "Источник или объект не найден"},
        409: {"description": "Конфликт версии или идентичности источника"},
    },
)
Kind = Literal["products", "categories", "suppliers", "warehouses"]
router.responses = {
    code: {**ERROR_RESPONSES.get(code, {}), **info} for code, info in router.responses.items()
}
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]


def get_service(session: Session):
    return CatalogService(CatalogRepository(session), ExchangeService(DataRepository(session)))


Service = Annotated[CatalogService, Depends(get_service)]


@router.get("/{kind}", response_model=list[CatalogOutput], summary="Список объектов справочника")
async def list_catalog(
    kind: Kind,
    service: Service,
    _user=Depends(require_permission("catalogs.read")),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200),
    active: bool | None = None,
):
    return await service.list(kind, limit, offset, q, active)


@router.get("/{kind}/{record_id}", response_model=CatalogOutput, summary="Объект справочника")
async def get_catalog(
    kind: Kind,
    record_id: UUID,
    service: Service,
    _user=Depends(require_permission("catalogs.read")),
):
    return await service.get(kind, record_id)


@router.post(
    "/{kind}",
    response_model=CatalogOutput,
    status_code=201,
    summary="Добавить объект с идентификатором источника",
    description="Версионированный upsert; повтор сохраняет UUID. Передавайте полную строку.",
)
async def create_catalog(
    kind: Kind,
    command: CatalogCommand,
    service: Service,
    user=Depends(require_permission("catalogs.write")),
):
    return await service.save(kind, command, user.id)


@router.patch(
    "/{kind}/{record_id}",
    response_model=CatalogOutput,
    summary="Обновить объект новой версией полной строки",
    description="Полная строка с revision выше предыдущей; идентичность источника неизменна.",
)
async def update_catalog(
    kind: Kind,
    record_id: UUID,
    command: CatalogCommand,
    service: Service,
    user=Depends(require_permission("catalogs.write")),
):
    return await service.save(kind, command, user.id, record_id)
