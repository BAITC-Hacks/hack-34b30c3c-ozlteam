from collections import defaultdict
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Replenishment.DTO.calculation import CreateCalculation
from app.Domains.Replenishment.repositories.calculation_repository import (
    CalculationRepository,
    SqlAlchemyCalculationRepository,
)
from app.Domains.Replenishment.resources.calculation import (
    RecommendationDetailOut,
    RecommendationOut,
)
from app.Domains.Replenishment.services.engine import ALGORITHM_VERSION
from app.Domains.Replenishment.services.explanation import explain_saved

CALCULATE_REPLENISHMENT = "calculate_replenishment"
CALCULATION_STEPS = ("Фиксирую данные", "Рассчитываю потребность", "Сохраняю рекомендации")


class ReplenishmentService:
    def __init__(self, repository: CalculationRepository, jobs: JobService | None = None):
        self.repository = repository
        self.jobs = jobs

    async def create(self, command: CreateCalculation, user_id: UUID):
        await self.repository.lock_key(user_id, command.idempotency_key)
        existing = await self.repository.by_key(user_id, command.idempotency_key)
        parameters = command.parameters.model_dump(mode="json")
        if existing:
            if (
                existing.warehouse_id,
                existing.category_id,
                existing.as_of,
                existing.parameters,
            ) != (command.warehouse_id, command.category_id, command.as_of, parameters):
                raise DomainError(
                    "Ключ повтора уже использован с другими параметрами",
                    409,
                    "idempotency_conflict",
                )
            return existing
        run = await self.repository.add_run(
            warehouse_id=command.warehouse_id,
            category_id=command.category_id,
            as_of=command.as_of,
            created_by=user_id,
            idempotency_key=command.idempotency_key,
            parameters=parameters,
            algorithm_version=ALGORITHM_VERSION,
        )
        if self.jobs is None:
            raise RuntimeError("Job service is required to create a calculation")
        job = await self.jobs.enqueue(CALCULATE_REPLENISHMENT, {"run_id": str(run.id)}, user_id)
        run.job_id = job.id
        await self.repository.flush()
        return run

    async def get(self, identifier: UUID):
        run = await self.repository.get_run(identifier)
        if run is None:
            raise DomainError("Расчёт не найден", 404, "calculation_not_found")
        return run

    async def list(self, limit: int, offset: int, warehouse_id: UUID | None):
        items, total = await self.repository.runs(limit, offset, warehouse_id)
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def recommendations(
        self,
        identifier: UUID,
        limit: int,
        offset: int,
        supplier_id: UUID | None,
        urgency: str | None,
    ):
        run = await self.get(identifier)
        if run.status != "done":
            raise DomainError("Результат расчёта ещё не готов", 409, "calculation_not_ready")
        rows, total = await self.repository.recommendations(
            identifier, limit, offset, supplier_id, urgency
        )
        items = [
            RecommendationOut.model_validate(row).model_copy(
                update={"order_id": order_id, "explanation": explain_saved(row)}
            )
            for row, order_id in rows
        ]
        groups = defaultdict(list)
        for item in items:
            groups[item.supplier_id].append(item)
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "supplier_groups": [
                {"supplier_id": key, "items": rows} for key, rows in groups.items()
            ],
        }

    async def recommendation(self, identifier: UUID):
        row = await self.repository.get_recommendation(identifier)
        if row is None:
            raise DomainError("Рекомендация не найдена", 404, "recommendation_not_found")
        recommendation, order_id = row
        return RecommendationDetailOut.model_validate(recommendation).model_copy(
            update={"order_id": order_id, "explanation": explain_saved(recommendation)}
        )

    async def overview(self, warehouse_id: UUID | None, draft_order_count: int):
        run = await self.repository.latest_success(warehouse_id)
        counts = (
            await self.repository.overview_counts(run.id)
            if run
            else {"deficit_count": 0, "excess_count": 0, "blocked_count": 0}
        )
        return {
            "latest_run": run,
            **counts,
            "draft_order_count": draft_order_count,
            "source_versions": run.source_versions if run else [],
            "warnings": run.warnings if run else ["no_successful_calculation"],
        }


async def get_recommendations_for_order(session: AsyncSession, ids: list[UUID]) -> list[dict]:
    """Immutable result facade; row locks serialize competing order allocation."""
    if len(ids) != len(set(ids)):
        raise DomainError("Рекомендации не должны повторяться", 409, "duplicate_recommendation")
    rows = await SqlAlchemyCalculationRepository(session).lock_recommendations(ids)
    if len(rows) != len(ids):
        raise DomainError("Рекомендация не найдена", 404, "recommendation_not_found")
    result = []
    for row, as_of in rows:
        if row.status != "ready" or row.recommended_quantity <= 0:
            raise DomainError(
                "Рекомендация не разрешает создание заказа", 409, "recommendation_blocked"
            )
        result.append(
            {
                "id": row.id,
                "run_id": row.run_id,
                "product_id": row.product_id,
                "supplier_id": row.supplier_id,
                "warehouse_id": row.warehouse_id,
                "sku": row.sku,
                "name": row.name,
                "unit": row.unit,
                "recommended_quantity": row.recommended_quantity,
                "as_of": as_of,
                "status": row.status,
                "explanation": row.explanation,
            }
        )
    return result
