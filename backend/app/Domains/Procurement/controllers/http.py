from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.core.access import require_permission
from app.core.errors import ERROR_RESPONSES, ErrorResponse
from app.Domains.Procurement.dependencies import get_order_service
from app.Domains.Procurement.DTO.order import (
    Acknowledge,
    CreateOrders,
    DeleteLine,
    EditLine,
    EditOrder,
    ReviseOrder,
    VersionCommand,
)
from app.Domains.Procurement.resources.order import AuditOut, DeliveryOut, HandoffOut, OrderOut
from app.Domains.Procurement.services.order_service import OrderService
from app.Domains.Users.models.user import User

router = APIRouter(
    prefix="/orders",
    tags=["Заказы поставщикам"],
    responses={
        401: {"model": ErrorResponse, "description": "Требуется действующая сессия"},
        403: {"model": ErrorResponse, "description": "Недостаточно прав"},
        404: {"model": ErrorResponse, "description": "Заказ, строка или рекомендация не найдены"},
        409: {
            "model": ErrorResponse,
            "description": "Конфликт версии, повторное распределение или заказ уже утверждён",
        },
        422: {"description": "Некорректные параметры запроса"},
    },
)
router.responses = {
    code: {**ERROR_RESPONSES.get(code, {}), **info} for code, info in router.responses.items()
}
Service = Annotated[OrderService, Depends(get_order_service)]
Read = Annotated[User, Depends(require_permission("orders.read"))]
Write = Annotated[User, Depends(require_permission("orders.write"))]
Approve = Annotated[User, Depends(require_permission("orders.approve"))]
Export = Annotated[User, Depends(require_permission("orders.export"))]
Integration = Annotated[User, Depends(require_permission("integrations.write"))]


@router.post(
    "/from-recommendations",
    response_model=list[OrderOut],
    status_code=201,
    summary="Создать черновики из рекомендаций",
    description="Группировка по поставщику и складу. Повтор того же ключа возвращает "
    "созданные заказы; другой состав с тем же ключом — 409. Повторно использовать "
    "распределённую рекомендацию нельзя. Ничего не отправляет поставщику.",
)
async def create_orders(data: CreateOrders, service: Service, user: Write):
    return await service.create(data, user.id)


@router.get("", response_model=list[OrderOut], summary="Список заказов с фильтрами")
async def list_orders(
    service: Service,
    user: Read,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: Literal["draft", "approved"] | None = None,
    supplier_id: UUID | None = None,
    warehouse_id: UUID | None = None,
):
    return await service.list(limit, offset, status, supplier_id, warehouse_id)


@router.get("/{order_id}", response_model=OrderOut, summary="Заказ и строки")
async def get_order(order_id: UUID, service: Service, user: Read):
    return await service.get(order_id)


@router.patch("/{order_id}", response_model=OrderOut, summary="Изменить комментарий черновика")
async def edit_order(order_id: UUID, data: EditOrder, service: Service, user: Write):
    return await service.edit(order_id, data, user.id)


@router.patch(
    "/{order_id}/lines/{line_id}",
    response_model=OrderOut,
    summary="Изменить количество строки с указанием причины",
)
async def edit_line(order_id: UUID, line_id: UUID, data: EditLine, service: Service, user: Write):
    return await service.edit_line(order_id, line_id, data, user.id)


@router.delete(
    "/{order_id}/lines/{line_id}",
    response_model=OrderOut,
    summary="Удалить строку черновика",
    description="Тело содержит expected_version и reason. Удаление сохраняется в аудите; "
    "рекомендация остаётся распределённой, чтобы исключить повторную закупку.",
)
async def delete_line(
    order_id: UUID, line_id: UUID, data: DeleteLine, service: Service, user: Write
):
    return await service.edit_line(order_id, line_id, data, user.id, delete=True)


@router.post(
    "/{order_id}/approve",
    response_model=OrderOut,
    summary="Утвердить неизменяемую версию заказа",
    description="Требуется orders.approve. Фиксирует количество, автора и время; "
    "не создаёт приход/товары в пути и не отправляет заказ поставщику.",
)
async def approve_order(order_id: UUID, data: VersionCommand, service: Service, user: Approve):
    return await service.approve(order_id, data, user.id)


@router.post(
    "/{order_id}/revise",
    response_model=OrderOut,
    status_code=201,
    summary="Создать новую редакцию отклонённого 1С заказа",
    description="Требуется orders.write. Только утверждённый заказ с явным rejected от 1С. "
    "Новая редакция получает отдельный ID и статус draft; старая остаётся неизменяемой. "
    "Повтор с той же expected_version и reason возвращает уже созданную редакцию. "
    "Другая причина при существующей редакции, pending/accepted или устаревшая версия — 409.",
)
async def revise_order(order_id: UUID, data: ReviseOrder, service: Service, user: Write):
    return await service.revise(order_id, data, user.id)


@router.get(
    "/{order_id}/audit", response_model=list[AuditOut], summary="История действий с заказом"
)
async def get_audit(
    order_id: UUID,
    service: Service,
    user: Read,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return await service.audits(order_id, limit, offset)


@router.get(
    "/{order_id}/export",
    response_class=Response,
    summary="Скачать утверждённую версию CSV или XLSX",
    responses={
        200: {
            "description": "Файл утверждённого заказа, включая исторические редакции; "
            "количество строкой "
            "без потери точности, без цены. CSV UTF-8 BOM.",
            "content": {
                "text/csv": {"schema": {"type": "string", "format": "binary"}},
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                    "schema": {"type": "string", "format": "binary"}
                },
            },
            "headers": {
                "Content-Disposition": {"schema": {"type": "string"}},
                "Cache-Control": {"schema": {"type": "string"}},
            },
        },
    },
)
async def export_order(
    order_id: UUID, service: Service, user: Export, format: Literal["csv", "xlsx"] = "xlsx"
):
    content = await service.export(order_id, format)
    revision = (await service.get(order_id)).revision
    content_type = (
        "text/csv"
        if format == "csv"
        else ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    )
    return Response(
        content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="order-{order_id}-r{revision}.{format}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/{order_id}/1c",
    response_model=HandoffOut,
    summary="Получить пакет утверждённого заказа для адаптера 1С",
    description="Локальный контракт, не сетевой вызов. Адаптер дедуплицирует по "
    "idempotency_key=order:{order_id}:revision:{revision}. Все количества — decimal strings. "
    "Отклонённый или заменённый новой редакцией документ возвращает 409.",
)
async def get_1c_handoff(order_id: UUID, service: Service, user: Export):
    return await service.handoff(order_id)


@router.post(
    "/{order_id}/1c/ack",
    response_model=DeliveryOut,
    summary="Зафиксировать подтверждение обработки пакета системой 1С",
    description="Требуется integrations.write. accepted требует external_document_id. "
    "Повтор идентичного ответа идемпотентен; принятый пакет нельзя заменить. "
    "После выпуска новой редакции изменить подтверждение старой нельзя (409). "
    "Утверждение и остатки не изменяются; реального обмена с 1С в этом API нет.",
)
async def acknowledge_1c(order_id: UUID, data: Acknowledge, service: Service, user: Integration):
    return await service.acknowledge(order_id, data, user.id)
