from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from app.core.errors import DomainError
from app.Domains.Replenishment.controllers.http import router
from app.Domains.Replenishment.dependencies import get_replenishment_service
from app.Domains.Replenishment.DTO.calculation import CreateCalculation
from app.Domains.Replenishment.services.replenishment_service import ReplenishmentService
from app.Domains.Security.dependencies import get_current_user


class Repository:
    def __init__(self):
        self.runs_by_id = {}

    async def lock_key(self, user_id, key):
        pass

    async def by_key(self, user_id, key):
        return next(
            (
                run
                for run in self.runs_by_id.values()
                if run.created_by == user_id and run.idempotency_key == key
            ),
            None,
        )

    async def add_run(self, **values):
        run = SimpleNamespace(
            **values,
            id=uuid4(),
            status="queued",
            source_versions=[],
            warnings=[],
            error=None,
            job_id=None,
            created_at=datetime.now(UTC),
            completed_at=None,
        )
        self.runs_by_id[run.id] = run
        return run

    async def get_run(self, identifier, lock=False):
        return self.runs_by_id.get(identifier)

    async def runs(self, limit, offset, warehouse_id):
        rows = [
            run
            for run in self.runs_by_id.values()
            if warehouse_id is None or run.warehouse_id == warehouse_id
        ]
        return rows[offset : offset + limit], len(rows)

    async def flush(self):
        pass


class Jobs:
    def __init__(self):
        self.calls = []

    async def enqueue(self, kind, payload, user_id):
        self.calls.append((kind, payload, user_id))
        return SimpleNamespace(id=uuid4())


def application(permissions):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    repository, jobs = Repository(), Jobs()
    service = ReplenishmentService(repository, jobs)
    user = SimpleNamespace(id=uuid4(), has_permission=lambda code: code in permissions)
    app.dependency_overrides[get_replenishment_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: user

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        return JSONResponse(
            status_code=error.status_code, content={"detail": error.detail, "code": error.code}
        )

    return app, repository, jobs


async def test_run_api_idempotency_conflict_history_and_not_ready():
    app, repository, jobs = application({"replenishment.read", "replenishment.run"})
    payload = {"warehouse_id": str(uuid4()), "as_of": "2026-05-31", "idempotency_key": "demo"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post("/api/v1/replenishment/runs", json=payload)
        assert first.status_code == 202
        identifier = first.json()["id"]
        again = await client.post("/api/v1/replenishment/runs", json=payload)
        assert again.json()["id"] == identifier
        assert len(jobs.calls) == 1
        conflict = await client.post(
            "/api/v1/replenishment/runs", json={**payload, "as_of": "2026-05-30"}
        )
        assert conflict.status_code == 409
        history = await client.get("/api/v1/replenishment/runs")
        assert history.status_code == 200
        assert history.json()["total"] == 1
        not_ready = await client.get(f"/api/v1/replenishment/runs/{identifier}/recommendations")
        assert not_ready.status_code == 409
        missing = await client.get(f"/api/v1/replenishment/runs/{uuid4()}")
        assert missing.status_code == 404
        invalid = await client.get("/api/v1/replenishment/runs?limit=201")
        assert invalid.status_code == 422


async def test_run_api_requires_specific_permission():
    app, _, jobs = application({"replenishment.read"})
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/replenishment/runs",
            json={"warehouse_id": str(uuid4()), "as_of": "2026-05-31", "idempotency_key": "denied"},
        )
        assert response.status_code == 403
        assert jobs.calls == []


def test_openapi_exposes_typed_status_errors_detail_and_authentication():
    app, _, _ = application(set())
    schema = app.openapi()
    create = schema["paths"]["/api/v1/replenishment/runs"]["post"]
    assert set(create["responses"]) >= {"202", "401", "403", "404", "409", "422"}
    assert create["security"]
    details = schema["components"]["schemas"]["RecommendationDetails"]["properties"]
    assert set(details) >= {"forecast", "history", "excluded_sales", "breakdown"}
    assert "source_versions" in schema["components"]["schemas"]["RunOut"]["properties"]


def test_invalid_calculation_parameters_rejected():
    with pytest.raises(ValueError):
        CreateCalculation(warehouse_id=uuid4(), as_of=date(2099, 1, 1), idempotency_key="future")
    with pytest.raises(ValueError):
        CreateCalculation(
            warehouse_id=uuid4(),
            as_of=date(2026, 1, 1),
            idempotency_key="bad",
            parameters={"history_days": 10},
        )
