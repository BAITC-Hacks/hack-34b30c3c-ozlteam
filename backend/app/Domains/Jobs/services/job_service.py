from uuid import UUID

from app.Domains.Jobs.contracts import (
    JOB_STEPS,
    JobNotFound,
    JobPayload,
    JobQueue,
    JobResult,
    JobStep,
    UnknownJobKind,
    UnknownJobStep,
)
from app.Domains.Jobs.models.job import Job
from app.Domains.Jobs.repositories.job_repository import JobRepository
from app.Domains.Jobs.resources.job import JobOut


class JobService:
    def __init__(self, repository: JobRepository, queue: JobQueue):
        self.repository = repository
        self.queue = queue

    async def enqueue(self, kind: str, payload: JobPayload, user_id: UUID | None) -> Job:
        """Persist the outbox inside the caller's transaction; dispatch only after commit."""
        if kind not in JOB_STEPS:
            raise UnknownJobKind(f"Unknown job kind '{kind}'")
        return await self.repository.add(kind, self._plan(kind), user_id, payload)

    async def get(self, job_id: UUID) -> JobOut:
        return JobOut.model_validate(await self._job(job_id))

    async def start(self, job_id: UUID) -> JobOut:
        job = await self._job(job_id)
        return JobOut.model_validate(await self.repository.update(job, status="running"))

    async def complete_step(self, job_id: UUID, name: str) -> JobOut:
        """Mark one visible step as done; every earlier step is done by then as well."""
        job = await self._job(job_id)
        if all(step["name"] != name for step in job.steps):
            raise UnknownJobStep(f"Job {job_id} has no step '{name}'")
        steps: list[JobStep] = []
        reached = False
        for step in job.steps:
            steps.append({"name": step["name"], "state": "pending" if reached else "done"})
            reached = reached or step["name"] == name
        return JobOut.model_validate(await self.repository.update(job, steps=steps))

    async def finish(self, job_id: UUID, result: JobResult) -> JobOut:
        job = await self._job(job_id)
        updated = await self.repository.update(
            job, status="done", steps=self._all_done(job.steps), result=result
        )
        return JobOut.model_validate(updated)

    async def fail(self, job_id: UUID, error: str) -> JobOut:
        job = await self._job(job_id)
        updated = await self.repository.update(job, status="failed", error=error)
        return JobOut.model_validate(updated)

    async def _job(self, job_id: UUID) -> Job:
        job = await self.repository.get(job_id)
        if job is None:
            raise JobNotFound(f"Job {job_id} does not exist")
        return job

    @staticmethod
    def _plan(kind: str) -> list[JobStep]:
        return [{"name": name, "state": "pending"} for name in JOB_STEPS[kind]]

    @staticmethod
    def _all_done(steps: list[JobStep]) -> list[JobStep]:
        return [{"name": step["name"], "state": "done"} for step in steps]
