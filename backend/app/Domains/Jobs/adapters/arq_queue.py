from asyncio import Lock
from uuid import UUID

import structlog
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from redis.exceptions import RedisError

from app.Domains.Jobs.contracts import JobPayload, QueueUnavailable

logger = structlog.get_logger(__name__)


class ArqJobQueue:
    """Publishes jobs to arq. The Redis pool is opened on first use, not at import time."""

    def __init__(self, redis_url: str | None):
        self._redis_url = redis_url
        self._pool: ArqRedis | None = None
        self._lock = Lock()

    async def enqueue(self, kind: str, job_id: UUID, payload: JobPayload) -> None:
        pool = await self._connect()
        try:
            # The database row id doubles as the arq job id, so a retry cannot queue twice.
            await pool.enqueue_job(kind, str(job_id), _job_id=f"{kind}:{job_id}", **payload)
        except RedisError as error:
            raise QueueUnavailable(f"Could not queue job {job_id}: {error}") from error
        logger.info("job.queued", job=str(job_id), kind=kind)

    async def _connect(self) -> ArqRedis:
        if not self._redis_url:
            raise QueueUnavailable("REDIS_URL is not set; background jobs cannot be queued")
        async with self._lock:
            if self._pool is None:
                try:
                    self._pool = await create_pool(RedisSettings.from_dsn(self._redis_url))
                except (OSError, RedisError, ValueError) as error:
                    raise QueueUnavailable(f"Redis is not reachable: {error}") from error
        return self._pool
