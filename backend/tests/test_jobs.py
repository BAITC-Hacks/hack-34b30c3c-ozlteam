from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.Domains.Jobs.contracts import (
    JOB_STEPS,
    PARSE_DOCUMENT,
    JobNotFound,
    UnknownJobKind,
    UnknownJobStep,
)
from app.Domains.Jobs.controllers.http import router
from app.Domains.Jobs.dependencies import get_job_service, get_job_stream
from app.Domains.Jobs.models.job import Job
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Jobs.services.job_stream import JobStream

PAYLOAD = {"file_id": str(uuid4()), "prompt": "Что по срокам?"}
READ, ASK, COLLECT = JOB_STEPS[PARSE_DOCUMENT]


class MemoryJobRepository:
    def __init__(self):
        self.jobs: dict[UUID, Job] = {}

    async def add(self, kind, steps, user_id):
        now = datetime.now(UTC)
        job = Job(
            id=uuid4(),
            kind=kind,
            status="queued",
            steps=steps,
            result=None,
            error=None,
            created_at=now,
            updated_at=now,
            created_by=user_id,
        )
        self.jobs[job.id] = job
        return job

    async def get(self, job_id):
        return self.jobs.get(job_id)

    async def update(self, job, *, status=None, steps=None, result=None, error=None):
        if status is not None:
            job.status = status
        if steps is not None:
            job.steps = steps
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        job.updated_at = datetime.now(UTC)
        return job


class MemoryQueue:
    def __init__(self):
        self.queued: list[tuple[str, UUID, dict]] = []

    async def enqueue(self, kind, job_id, payload):
        self.queued.append((kind, job_id, payload))


def open_service(service: JobService):
    @asynccontextmanager
    async def factory():
        yield service

    return factory


@pytest.fixture
def queue():
    return MemoryQueue()


@pytest.fixture
def service(queue):
    return JobService(MemoryJobRepository(), queue)


@pytest.fixture
async def client(service):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_job_service] = lambda: service
    app.dependency_overrides[get_job_stream] = lambda: JobStream(
        open_service(service), poll_interval=0.0
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_enqueue_records_pending_steps_and_queues_the_task(service, queue):
    user_id = uuid4()
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, user_id)

    assert job.status == "queued"
    assert job.created_by == user_id
    assert job.steps == [{"name": name, "state": "pending"} for name in JOB_STEPS[PARSE_DOCUMENT]]
    assert queue.queued == [(PARSE_DOCUMENT, job.id, PAYLOAD)]


async def test_unknown_kind_is_neither_stored_nor_queued(service, queue):
    with pytest.raises(UnknownJobKind):
        await service.enqueue("summarize_contract", PAYLOAD, None)
    assert queue.queued == []


async def test_status_transitions_to_done(service):
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, None)

    assert (await service.start(job.id)).status == "running"

    after_read = await service.complete_step(job.id, READ)
    assert [step.state for step in after_read.steps] == ["done", "pending", "pending"]

    after_ask = await service.complete_step(job.id, ASK)
    assert [step.state for step in after_ask.steps] == ["done", "done", "pending"]

    finished = await service.finish(job.id, {"answer": "Срок сдвигается на неделю"})
    assert finished.status == "done"
    assert finished.result == {"answer": "Срок сдвигается на неделю"}
    assert [step.state for step in finished.steps] == ["done", "done", "done"]
    assert [step.name for step in finished.steps] == [READ, ASK, COLLECT]
    assert finished.error is None


async def test_status_transitions_to_failed(service):
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, None)
    await service.start(job.id)

    failed = await service.fail(job.id, "LlmUnavailable: OPENAI_API_KEY is not set")

    assert failed.status == "failed"
    assert failed.error == "LlmUnavailable: OPENAI_API_KEY is not set"
    # A failure keeps the steps that were already reached visible.
    assert [step.state for step in failed.steps] == ["pending", "pending", "pending"]


async def test_unknown_step_is_rejected(service):
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, None)
    with pytest.raises(UnknownJobStep):
        await service.complete_step(job.id, "Печатаю отчёт")


@pytest.mark.parametrize("call", ["get", "start", "fail"])
async def test_missing_job_is_reported(service, call):
    missing = uuid4()
    with pytest.raises(JobNotFound):
        if call == "get":
            await service.get(missing)
        elif call == "start":
            await service.start(missing)
        else:
            await service.fail(missing, "boom")


async def test_http_exposes_only_the_public_fields(client, service):
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, uuid4())

    response = await client.get(f"/api/v1/jobs/{job.id}")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"id", "kind", "status", "steps", "result", "error"}
    assert body["id"] == str(job.id)
    assert body["kind"] == PARSE_DOCUMENT
    assert body["status"] == "queued"
    assert body["steps"][0] == {"name": READ, "state": "pending"}


async def test_http_reports_missing_jobs(client):
    missing = uuid4()
    assert (await client.get(f"/api/v1/jobs/{missing}")).status_code == 404
    assert (await client.get(f"/api/v1/jobs/{missing}/events")).status_code == 404


async def test_stream_emits_every_change_and_closes_when_done(service):
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, None)
    await service.start(job.id)
    stream = JobStream(open_service(service), poll_interval=0.0)

    snapshots = []
    async for snapshot in stream.watch(job.id):
        # Progress the job between polls, exactly as the worker would.
        snapshots.append(snapshot)
        if len(snapshots) == 1:
            await service.complete_step(job.id, READ)
        elif len(snapshots) == 2:
            await service.finish(job.id, {"answer": "готово"})

    assert [snapshot.status for snapshot in snapshots] == ["running", "running", "done"]
    assert snapshots[-1].result == {"answer": "готово"}


async def test_stream_gives_up_on_a_stuck_job(service):
    job = await service.enqueue(PARSE_DOCUMENT, PAYLOAD, None)
    stream = JobStream(open_service(service), poll_interval=0.0, timeout=0.0)

    snapshots = [snapshot async for snapshot in stream.watch(job.id)]

    assert [snapshot.status for snapshot in snapshots] == ["queued"]
