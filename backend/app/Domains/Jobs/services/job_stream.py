from asyncio import sleep
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager
from time import monotonic
from uuid import UUID

from app.Domains.Jobs.contracts import FINAL_STATUSES
from app.Domains.Jobs.resources.job import JobOut
from app.Domains.Jobs.services.job_service import JobService

DEFAULT_POLL_INTERVAL = 1.0
# A stuck job must not keep a connection open forever; the client can reconnect.
DEFAULT_TIMEOUT = 900.0


class JobStream:
    """Status snapshots of a job, one per actual change, until it is done or failed."""

    def __init__(
        self,
        jobs: Callable[[], AbstractAsyncContextManager[JobService]],
        poll_interval: float = DEFAULT_POLL_INTERVAL,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        self.jobs = jobs
        self.poll_interval = poll_interval
        self.timeout = timeout

    async def watch(self, job_id: UUID) -> AsyncIterator[JobOut]:
        deadline = monotonic() + self.timeout
        previous: str | None = None
        while True:
            # A new short transaction per poll: a stream must not hold one open.
            async with self.jobs() as service:
                job = await service.get(job_id)
            snapshot = job.model_dump_json()
            if snapshot != previous:
                previous = snapshot
                yield job
            if job.status in FINAL_STATUSES or monotonic() >= deadline:
                return
            await sleep(self.poll_interval)
