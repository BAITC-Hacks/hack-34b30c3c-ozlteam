from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Jobs.contracts import JobPayload, JobResult, JobStatus, JobStep
from app.Domains.Jobs.models.job import Job


class JobRepository(Protocol):
    async def add(
        self, kind: str, steps: list[JobStep], user_id: UUID | None, payload: JobPayload
    ) -> Job: ...

    async def get(self, job_id: UUID) -> Job | None: ...

    async def update(
        self,
        job: Job,
        *,
        status: JobStatus | None = None,
        steps: list[JobStep] | None = None,
        result: JobResult | None = None,
        error: str | None = None,
    ) -> Job: ...


class SqlAlchemyJobRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(
        self, kind: str, steps: list[JobStep], user_id: UUID | None, payload: JobPayload
    ) -> Job:
        job = Job(kind=kind, status="queued", steps=steps, created_by=user_id, payload=payload)
        self.session.add(job)
        await self.session.flush()
        await self.session.refresh(job)
        return job

    async def get(self, job_id: UUID) -> Job | None:
        return await self.session.get(Job, job_id)

    async def pending_dispatch(self, now: datetime) -> list[Job]:
        return list(
            await self.session.scalars(
                select(Job)
                .where(
                    or_(
                        Job.status == "queued",
                        and_(Job.status == "running", Job.updated_at < now - timedelta(minutes=12)),
                    ),
                    or_(
                        Job.dispatched_at.is_(None), Job.dispatched_at < now - timedelta(seconds=30)
                    ),
                )
                .order_by(Job.created_at)
                .limit(50)
                .with_for_update(skip_locked=True)
            )
        )

    async def record_dispatch(self, job: Job, now: datetime) -> None:
        await self.session.execute(
            update(Job)
            .where(Job.id == job.id)
            .values(
                dispatched_at=now,
                dispatch_count=Job.dispatch_count + 1,
                updated_at=Job.updated_at,
            )
        )

    async def update(
        self,
        job: Job,
        *,
        status: JobStatus | None = None,
        steps: list[JobStep] | None = None,
        result: JobResult | None = None,
        error: str | None = None,
    ) -> Job:
        # Only the fields that are passed change; None means "leave as is".
        if status is not None:
            job.status = status
        if steps is not None:
            job.steps = steps
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        await self.session.flush()
        await self.session.refresh(job)
        return job
