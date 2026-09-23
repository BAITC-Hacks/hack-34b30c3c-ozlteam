from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Jobs.contracts import JobResult, JobStatus, JobStep
from app.Domains.Jobs.models.job import Job


class JobRepository(Protocol):
    async def add(self, kind: str, steps: list[JobStep], user_id: UUID | None) -> Job: ...

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

    async def add(self, kind: str, steps: list[JobStep], user_id: UUID | None) -> Job:
        job = Job(kind=kind, status="queued", steps=steps, created_by=user_id)
        self.session.add(job)
        await self.session.flush()
        await self.session.refresh(job)
        return job

    async def get(self, job_id: UUID) -> Job | None:
        return await self.session.get(Job, job_id)

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
