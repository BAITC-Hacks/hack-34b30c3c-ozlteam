"""Outbox recovery against the migrated PostgreSQL layout, without touching Redis."""

import os
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — resolve the same foreign-key metadata as API and worker
from app.core.config import get_settings
from app.Domains.Jobs import dispatch
from app.Domains.Jobs.models.job import Job
from app.Domains.Jobs.repositories.job_repository import SqlAlchemyJobRepository
from app.Domains.Jobs.services.job_service import JobService

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_DB_TESTS") != "1",
    reason="Set RUN_DB_TESTS=1 to use the migrated Compose database",
)

KIND = "calculate_replenishment"


class RecoverableQueue:
    def __init__(self):
        self.unavailable = False
        self.attempts = []
        self.published = []

    async def enqueue(self, kind, job_id, payload):
        delivery = (kind, job_id, deepcopy(payload))
        self.attempts.append(delivery)
        if self.unavailable:
            raise ConnectionError("Test queue is offline")
        self.published.append(delivery)


@pytest.fixture
async def outbox(monkeypatch):
    engine = create_async_engine(get_settings().database_url)
    clock = SimpleNamespace(now=datetime(2026, 9, 23, 12, tzinfo=UTC))
    queue = RecoverableQueue()

    class FrozenDatetime:
        @classmethod
        def now(cls, timezone):
            return clock.now.astimezone(timezone)

    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                # PostgreSQL resolves unqualified jobs to this connection-local table first.
                # It has the actual migrated layout/defaults/indexes, while unrelated jobs
                # cannot be selected, locked, republished or updated by these tests.
                await connection.execute(
                    text("CREATE TEMP TABLE jobs (LIKE public.jobs INCLUDING ALL) ON COMMIT DROP")
                )
                sessions = async_sessionmaker(
                    connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
                )
                monkeypatch.setattr(dispatch, "session_factory", sessions)
                monkeypatch.setattr(dispatch, "get_job_queue", lambda: queue)
                monkeypatch.setattr(dispatch, "datetime", FrozenDatetime)
                yield SimpleNamespace(sessions=sessions, queue=queue, clock=clock)
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()


async def read_job(outbox, identifier):
    async with outbox.sessions() as session:
        return await session.get(Job, identifier)


async def test_outbox_persists_payload_survives_queue_failure_and_recovers(outbox):
    payload = {"run_id": str(uuid4())}
    outbox.queue.unavailable = True
    async with outbox.sessions.begin() as session:
        service = JobService(SqlAlchemyJobRepository(session), outbox.queue)
        created = await service.enqueue(KIND, payload, None)
        identifier = created.id
        assert identifier.version == 7
    # A different session reads the durable outbox after the use-case commit.
    persisted = await read_job(outbox, identifier)
    assert persisted.payload == payload
    assert persisted.status == "queued"
    assert persisted.dispatch_count == 0
    assert persisted.dispatched_at is None
    assert outbox.queue.attempts == []
    original_updated_at = persisted.updated_at

    await dispatch.dispatch_pending({})
    failed_delivery = await read_job(outbox, identifier)
    assert failed_delivery.status == "queued"
    assert failed_delivery.payload == payload
    assert failed_delivery.dispatch_count == 0
    assert failed_delivery.dispatched_at is None
    assert failed_delivery.updated_at == original_updated_at
    assert outbox.queue.attempts == [(KIND, identifier, payload)]
    assert outbox.queue.published == []

    outbox.queue.unavailable = False
    await dispatch.dispatch_pending({})
    recovered = await read_job(outbox, identifier)
    assert outbox.queue.published == [(KIND, identifier, payload)]
    assert recovered.dispatch_count == 1
    assert recovered.dispatched_at == outbox.clock.now
    assert recovered.updated_at == original_updated_at
    assert recovered.status == "queued"


async def test_queued_job_is_republished_after_redis_loss_and_thirty_second_cooldown(outbox):
    payload = {"run_id": str(uuid4())}
    async with outbox.sessions.begin() as session:
        job = await JobService(SqlAlchemyJobRepository(session), outbox.queue).enqueue(
            KIND, payload, None
        )
        identifier = job.id
    await dispatch.dispatch_pending({})
    first = await read_job(outbox, identifier)
    assert first.dispatch_count == 1

    # Simulate Redis losing its queue, while PostgreSQL still knows the payload.
    outbox.queue.published.clear()
    outbox.clock.now += timedelta(seconds=29)
    await dispatch.dispatch_pending({})
    assert outbox.queue.published == []
    assert (await read_job(outbox, identifier)).dispatch_count == 1

    outbox.clock.now += timedelta(seconds=2)
    await dispatch.dispatch_pending({})
    assert outbox.queue.published == [(KIND, identifier, payload)]
    republished = await read_job(outbox, identifier)
    assert republished.dispatch_count == 2
    assert republished.dispatched_at == outbox.clock.now
    assert republished.updated_at == first.updated_at


async def test_stale_running_lease_replays_without_renewing_worker_heartbeat(outbox):
    now = outbox.clock.now
    cases = {
        "fresh": ("running", now - timedelta(minutes=11), None),
        "stale": ("running", now - timedelta(minutes=13), None),
        "stale_retry": ("running", now - timedelta(minutes=13), now - timedelta(seconds=40)),
        "cooldown": ("running", now - timedelta(minutes=13), now - timedelta(seconds=10)),
        "done": ("done", now - timedelta(hours=1), None),
        "failed": ("failed", now - timedelta(hours=1), None),
    }
    identifiers = {}
    async with outbox.sessions.begin() as session:
        for label, (status, updated_at, dispatched_at) in cases.items():
            job = Job(
                kind=KIND,
                status=status,
                payload={"run_id": str(uuid4())},
                steps=[],
                created_at=now - timedelta(hours=2),
                updated_at=updated_at,
                dispatched_at=dispatched_at,
                dispatch_count=0,
            )
            session.add(job)
            await session.flush()
            identifiers[label] = job.id

    await dispatch.dispatch_pending({})
    assert {identifier for _, identifier, _ in outbox.queue.published} == {
        identifiers["stale"],
        identifiers["stale_retry"],
    }
    async with outbox.sessions() as session:
        rows = {job.id: job for job in await session.scalars(select(Job))}
    for label, identifier in identifiers.items():
        assert rows[identifier].status == cases[label][0]
        assert rows[identifier].updated_at == cases[label][1]
        assert rows[identifier].dispatch_count == (1 if label in {"stale", "stale_retry"} else 0)

    # Dispatch timestamps only throttle publication; they must not reset the worker lease.
    outbox.clock.now += timedelta(seconds=31)
    outbox.queue.published.clear()
    await dispatch.dispatch_pending({})
    assert {identifier for _, identifier, _ in outbox.queue.published} == {
        identifiers["stale"],
        identifiers["stale_retry"],
        identifiers["cooldown"],
    }
    stale = await read_job(outbox, identifiers["stale"])
    assert stale.dispatch_count == 2
    assert stale.updated_at == cases["stale"][1]
