from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_permission
from app.core.database import get_session
from app.core.errors import ERROR_RESPONSES
from app.Domains.Replenishment.controllers.preview import router as preview_router
from app.Domains.Replenishment.dependencies import get_replenishment_service
from app.Domains.Replenishment.DTO.calculation import CreateCalculation
from app.Domains.Replenishment.resources.calculation import (
    OverviewOut,
    RecommendationDetailOut,
    RecommendationPage,
    RunOut,
    RunPage,
)
from app.Domains.Replenishment.services.replenishment_service import ReplenishmentService
from app.Domains.Users.models.user import User

router = APIRouter(tags=["Пополнение склада"], responses=ERROR_RESPONSES)
Service = Annotated[ReplenishmentService, Depends(get_replenishment_service)]
Reader = Annotated[User, Depends(require_permission("replenishment.read"))]
Runner = Annotated[User, Depends(require_permission("replenishment.run"))]
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]


@router.post(
    "/replenishment/runs",
    response_model=RunOut,
    status_code=202,
    summary="Запустить расчёт пополнения",
    description="Право replenishment.run. Задача выполняется в фоне; job_id доступен в Jobs/SSE. "
    "Ключ повтора действует в рамках пользователя: повтор возвращает тот же расчёт, "
    "изменённое тело с тем же ключом даёт 409. Входной срез фиксируется воркером.",
)
async def create_run(data: CreateCalculation, service: Service, user: Runner):
    return await service.create(data, user.id)


@router.get(
    "/replenishment/runs",
    response_model=RunPage,
    summary="История расчётов",
    description="Право replenishment.read. Новые расчёты первыми, фильтр по складу.",
)
async def list_runs(
    service: Service,
    user: Reader,
    warehouse_id: UUID | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return await service.list(limit, offset, warehouse_id)


@router.get(
    "/replenishment/runs/{run_id}",
    response_model=RunOut,
    summary="Статус, параметры и версии источников расчёта",
)
async def get_run(run_id: UUID, service: Service, user: Reader):
    return await service.get(run_id)


@router.get(
    "/replenishment/runs/{run_id}/recommendations",
    response_model=RecommendationPage,
    summary="Рекомендации расчёта с группировкой по поставщику",
    description="Право replenishment.read. Группы содержат только строки текущей страницы. "
    "Поставщик null означает проблему данных; status=blocked запрещает заказ. "
    "409 — расчёт не завершён. Сортировка: поставщик, артикул, ID.",
)
async def list_recommendations(
    run_id: UUID,
    service: Service,
    user: Reader,
    supplier_id: UUID | None = None,
    urgency: Literal["none", "normal", "high", "critical"] | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
):
    return await service.recommendations(run_id, limit, offset, supplier_id, urgency)


@router.get(
    "/recommendations/{recommendation_id}",
    response_model=RecommendationDetailOut,
    summary="Обоснование позиции: история, прогноз, выбросы и формула",
    description="Право replenishment.read. Числа сохранены вместе с результатом и не "
    "пересчитываются при изменении справочников. Количества — десятичные строки.",
)
async def get_recommendation(recommendation_id: UUID, service: Service, user: Reader):
    return await service.recommendation(recommendation_id)


@router.get(
    "/overview",
    response_model=OverviewOut,
    summary="Обзор закупок и рисков",
    description="Право replenishment.read. Риски относятся к последнему успешному расчёту "
    "выбранного склада (либо последнему расчёту вообще), а не сумме разных срезов. "
    "Черновики считаются по текущему состоянию заказов.",
)
async def overview(
    service: Service,
    user: Reader,
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
    warehouse_id: UUID | None = None,
):
    from app.Domains.Procurement.services.order_service import count_draft_orders

    return await service.overview(warehouse_id, await count_draft_orders(session, warehouse_id))


router.include_router(preview_router)
