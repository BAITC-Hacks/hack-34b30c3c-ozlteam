import asyncio
from uuid import UUID

import structlog

from app.core.database import session_factory
from app.core.errors import DomainError
from app.Domains.Inventory.services.inventory_service import get_snapshot
from app.Domains.Jobs.dependencies import open_job_service
from app.Domains.Replenishment.repositories.calculation_repository import (
    SqlAlchemyCalculationRepository,
)
from app.Domains.Replenishment.services.engine import calculate
from app.Domains.Replenishment.services.replenishment_service import CALCULATION_STEPS

logger = structlog.get_logger(__name__)


async def calculate_replenishment(ctx: dict, job_id: str, run_id: str) -> None:
    """Retry-safe job: snapshot commit → CPU work → atomic immutable result publication."""
    identifier, job_identifier = UUID(run_id), UUID(job_id)
    try:
        async with open_job_service() as jobs:
            await jobs.start(job_identifier)
        async with session_factory() as session, session.begin():
            repository = SqlAlchemyCalculationRepository(session)
            run = await repository.get_run(identifier, lock=True)
            if run is None or run.job_id != job_identifier:
                raise DomainError("Расчёт не найден", 404, "calculation_not_found")
            done = run.status == "done"
            if not done:
                if run.input_snapshot is None:
                    # Inventory takes source row locks; every importer follows the same lock order.
                    snapshot = await get_snapshot(
                        session, run.warehouse_id, run.category_id, run.as_of
                    )
                    run.input_snapshot = snapshot
                    run.source_versions = snapshot.get("source_versions", [])
                    run.warnings = snapshot.get("warnings", [])
                run.status = "running"
                run.error = None
            snapshot, as_of, parameters = run.input_snapshot, run.as_of, run.parameters
        if not done:
            async with open_job_service() as jobs:
                await jobs.complete_step(job_identifier, CALCULATION_STEPS[0])
            results = await asyncio.to_thread(calculate, snapshot, as_of, parameters)
            async with open_job_service() as jobs:
                await jobs.complete_step(job_identifier, CALCULATION_STEPS[1])
            async with session_factory() as session, session.begin():
                repository = SqlAlchemyCalculationRepository(session)
                run = await repository.get_run(identifier, lock=True)
                if run.status != "done":
                    await repository.publish(run, results)
        async with open_job_service() as jobs:
            await jobs.finish(job_identifier, {"run_id": run_id})
    except Exception as error:
        # Never put sales rows, customer values or database exception parameters in job errors.
        logger.error("replenishment.failed", run_id=run_id, error_type=type(error).__name__)
        async with session_factory() as session, session.begin():
            repository = SqlAlchemyCalculationRepository(session)
            run = await repository.get_run(identifier, lock=True)
            if run and run.status != "done":
                run.status = "failed"
                run.error = (
                    error.detail
                    if isinstance(error, DomainError)
                    else "Ошибка расчёта; повторите задачу"
                )
        async with open_job_service() as jobs:
            await jobs.fail(
                job_identifier,
                "Не удалось завершить расчёт; данные и ранее готовые результаты сохранены",
            )
        raise
