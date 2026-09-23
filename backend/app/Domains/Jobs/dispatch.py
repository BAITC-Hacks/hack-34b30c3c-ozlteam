"""Replay committed jobs after process/Redis failures without a DB/queue commit race."""

from datetime import UTC, datetime

import structlog

from app.core.database import session_factory
from app.Domains.Jobs.dependencies import get_job_queue
from app.Domains.Jobs.repositories.job_repository import SqlAlchemyJobRepository

logger = structlog.get_logger(__name__)


async def dispatch_pending(ctx: dict[str, object]) -> None:
    now = datetime.now(UTC)
    async with session_factory() as session, session.begin():
        repository = SqlAlchemyJobRepository(session)
        jobs = await repository.pending_dispatch(now)
        for job in jobs:
            try:
                # arq's stable job ID deduplicates publication while a worker owns it.
                await get_job_queue().enqueue(job.kind, job.id, job.payload)
            except Exception:
                logger.warning("job.dispatch_unavailable", job=str(job.id))
                break
            await repository.record_dispatch(job, now)
