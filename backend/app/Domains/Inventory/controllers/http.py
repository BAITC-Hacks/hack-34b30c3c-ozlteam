from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES
from app.Domains.Inventory.repositories.inventory_repository import InventoryRepository
from app.Domains.Inventory.resources.inventory import InventoryOutput, StockResource
from app.Domains.Inventory.services.inventory_service import InventoryService
from app.Domains.Inventory.services.sales_document_export import XLSX_MEDIA_TYPE

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
    "/sales/{sale_id}/document",
    response_class=Response,
    summary="Скачать строки документа продажи в XLSX",
    description=(
        "Требуется inventory.read. Выгрузка всех загруженных строк с тем же source_id и "
        "document_id, что у указанной продажи, включая отменённые и другие товары/склады. "
        "Фильтры и пагинация таблицы не применяются. Это не оригинал накладной. "
        "Колонки: артикул, наименование, код 1С, склад, кол-во, ед., статус. "
        "ID строки и дата не выводятся; артикул и код 1С сохраняются без изменений. "
        "Количество записано текстом без округления. Более 100 000 строк дают ошибку 422; "
        "частичные документы не выдаются."
    ),
    responses={
        200: {
            "description": "Книга XLSX с загруженными строками документа и сведениями об источнике",
            "content": {XLSX_MEDIA_TYPE: {"schema": {"type": "string", "format": "binary"}}},
            "headers": {
                "Content-Disposition": {
                    "description": 'attachment; filename="sales-document-{sale_id}.xlsx"',
                    "schema": {"type": "string"},
                },
                "Cache-Control": {"schema": {"type": "string", "const": "private, no-store"}},
            },
        },
        404: {**ERROR_RESPONSES[404], "description": "Продажа не найдена"},
        422: ERROR_RESPONSES[422],
    },
)
async def download_sales_document(sale_id: UUID, service: Service):
    content = await service.export_sales_document(sale_id)
    return Response(
        content,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="sales-document-{sale_id}.xlsx"',
            "Cache-Control": "private, no-store",
        },
    )


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
