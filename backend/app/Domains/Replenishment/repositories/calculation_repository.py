from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Replenishment.models.calculation import CalculationRun, Recommendation


class CalculationRepository(Protocol):
    async def lock_key(self, user_id: UUID, key: str) -> None: ...
    async def by_key(self, user_id: UUID, key: str) -> CalculationRun | None: ...
    async def add_run(self, **values) -> CalculationRun: ...
    async def get_run(self, identifier: UUID, lock: bool = False) -> CalculationRun | None: ...
    async def runs(self, limit: int, offset: int, warehouse_id=None) -> tuple[list, int]: ...
    async def recommendations(
        self, run_id: UUID, limit: int, offset: int, supplier_id=None, urgency=None
    ) -> tuple[list, int]: ...
    async def get_recommendation(self, identifier: UUID) -> Recommendation | None: ...
    async def lock_recommendations(self, identifiers: list[UUID]) -> list: ...
    async def latest_success(self, warehouse_id=None) -> CalculationRun | None: ...
    async def overview_counts(self, run_id: UUID) -> dict: ...
    async def flush(self) -> None: ...


class SqlAlchemyCalculationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def lock_key(self, user_id: UUID, key: str) -> None:
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"replenishment:{user_id}:{key}"},
        )

    async def by_key(self, user_id: UUID, key: str) -> CalculationRun | None:
        return await self.session.scalar(
            select(CalculationRun).where(
                CalculationRun.created_by == user_id, CalculationRun.idempotency_key == key
            )
        )

    async def add_run(self, **values) -> CalculationRun:
        run = CalculationRun(**values)
        self.session.add(run)
        await self.session.flush()
        return run

    async def get_run(self, identifier: UUID, lock: bool = False) -> CalculationRun | None:
        statement = select(CalculationRun).where(CalculationRun.id == identifier)
        if lock:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def runs(self, limit: int, offset: int, warehouse_id=None) -> tuple[list, int]:
        conditions = [] if warehouse_id is None else [CalculationRun.warehouse_id == warehouse_id]
        total = await self.session.scalar(
            select(func.count()).select_from(CalculationRun).where(*conditions)
        )
        rows = await self.session.scalars(
            select(CalculationRun)
            .where(*conditions)
            .order_by(CalculationRun.created_at.desc(), CalculationRun.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows), total or 0

    async def recommendations(
        self, run_id: UUID, limit: int, offset: int, supplier_id=None, urgency=None
    ) -> tuple[list, int]:
        conditions = [Recommendation.run_id == run_id]
        if supplier_id:
            conditions.append(Recommendation.supplier_id == supplier_id)
        if urgency:
            conditions.append(Recommendation.urgency == urgency)
        total = await self.session.scalar(
            select(func.count()).select_from(Recommendation).where(*conditions)
        )
        rows = await self.session.scalars(
            select(Recommendation)
            .where(*conditions)
            .order_by(Recommendation.supplier_id, Recommendation.sku, Recommendation.id)
            .limit(limit)
            .offset(offset)
        )
        return list(rows), total or 0

    async def get_recommendation(self, identifier: UUID) -> Recommendation | None:
        return await self.session.get(Recommendation, identifier)

    async def lock_recommendations(self, identifiers: list[UUID]) -> list:
        return list(
            await self.session.execute(
                select(Recommendation, CalculationRun.as_of)
                .join(CalculationRun)
                .where(Recommendation.id.in_(identifiers), CalculationRun.status == "done")
                .order_by(Recommendation.id)
                .with_for_update(of=Recommendation)
            )
        )

    async def latest_success(self, warehouse_id=None) -> CalculationRun | None:
        statement = select(CalculationRun).where(CalculationRun.status == "done")
        if warehouse_id:
            statement = statement.where(CalculationRun.warehouse_id == warehouse_id)
        return await self.session.scalar(
            statement.order_by(CalculationRun.completed_at.desc(), CalculationRun.id.desc()).limit(
                1
            )
        )

    async def overview_counts(self, run_id: UUID) -> dict:
        rows = list(
            await self.session.scalars(
                select(Recommendation).where(Recommendation.run_id == run_id)
            )
        )
        return {
            "deficit_count": sum(row.urgency in {"high", "critical"} for row in rows),
            "excess_count": sum(
                float(row.details["breakdown"]["excess_quantity"]) > 0 for row in rows
            ),
            "blocked_count": sum(row.status == "blocked" for row in rows),
        }

    async def publish(self, run: CalculationRun, results: list[dict]) -> None:
        for result in results:
            self.session.add(
                Recommendation(
                    run_id=run.id,
                    warehouse_id=run.warehouse_id,
                    **{
                        **result,
                        "product_id": UUID(result["product_id"]),
                        "supplier_id": UUID(str(result["supplier_id"]))
                        if result["supplier_id"]
                        else None,
                    },
                )
            )
        run.status = "done"
        run.completed_at = datetime.now(UTC)
        run.error = None
        await self.session.flush()

    async def flush(self) -> None:
        await self.session.flush()
