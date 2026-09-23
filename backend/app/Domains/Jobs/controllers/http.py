from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.Domains.Jobs.contracts import JobNotFound
from app.Domains.Jobs.dependencies import get_job_service, get_job_stream
from app.Domains.Jobs.resources.job import JobOut
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Jobs.services.job_stream import JobStream

router = APIRouter(prefix="/jobs", tags=["Jobs"])
Service = Annotated[JobService, Depends(get_job_service)]
Stream = Annotated[JobStream, Depends(get_job_stream)]

STATUS_EVENT = "status"


def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Job not found")


@router.get("/{job_id}", response_model=JobOut)
async def get_job(job_id: UUID, service: Service):
    try:
        return await service.get(job_id)
    except JobNotFound as error:
        raise not_found() from error


@router.get("/{job_id}/events")
async def job_events(job_id: UUID, service: Service, stream: Stream):
    # Fail loudly before the stream opens: an unknown job must answer 404, not an empty stream.
    try:
        await service.get(job_id)
    except JobNotFound as error:
        raise not_found() from error
    return EventSourceResponse(_status_events(stream, job_id))


async def _status_events(stream: JobStream, job_id: UUID) -> AsyncIterator[dict[str, str]]:
    async for job in stream.watch(job_id):
        yield {"event": STATUS_EVENT, "data": job.model_dump_json()}
