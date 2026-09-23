from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES
from app.Domains.Inventory.repositories.inventory_repository import InventoryRepository
from app.Domains.Inventory.resources.inventory import InventoryOutput, StockResource
from app.Domains.Inventory.services.inventory_service import InventoryService

router = APIRouter(
    prefix="/inventory",
    tags=["Запасы"],
    dependencies=[Depends(require_permission("inventory.read"))],
    responses={
        401: {"description": "Требуется авторизация"},
        403: {"description": "Недостаточно прав"},
    },
)
router.responses = {
    code: {**ERROR_RESPONSES.get(code, {}), **info} for code, info in router.responses.items()
}
Session = Annotated[AsyncSession, Depends(get_session, scope="function")]


def get_service(session: Session):
    return InventoryService(InventoryRepository(session))


Service = Annotated[InventoryService, Depends(get_service)]


@router.get(
    "",
    response_model=list[StockResource],
    summary="Текущие остатки склада",
    description=(
        "Последний снимок на текущий момент по складу и товару; quantity включает reserved."
    ),
)
async def list_stocks(
    service: Service,
    warehouse_id: UUID | None = None,
    product_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await service.list("stocks", warehouse_id, product_id, limit, offset, current=True)


@router.get(
    "/{kind}",
    response_model=list[InventoryOutput],
    summary="Исходные данные запаса и спроса",
    description=(
        "Возвращает также отменённые документы для аудита. Расчёт использует только действующие."
    ),
)
async def list_inventory(
    kind: Literal["sales", "stocks", "inbound", "stockouts", "growth"],
    service: Service,
    warehouse_id: UUID | None = None,
    product_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await service.list(kind, warehouse_id, product_id, limit, offset)
