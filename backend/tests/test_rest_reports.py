from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.errors import DomainError
from app.Domains.Integrations1C.controllers.reports import get_report_service, router
from app.Domains.Integrations1C.DTO.reports import SaveReport
from app.Domains.Integrations1C.services import report_service
from app.Domains.Integrations1C.services.report_service import (
    ReportService,
    extract_rows,
    fetch_report,
    report_kinds,
)
from app.Domains.Security.dependencies import get_current_user


def profile(**values):
    return SaveReport(
        name=values.pop("name", "Отчёт"),
        kind=values.pop("kind", "categories"),
        url=values.pop("url", "https://one-c.example/report"),
        **values,
    )


def test_metadata_covers_contract_and_required_identity_and_version():
    kinds = report_kinds()
    assert len(kinds) == 9
    assert {field.name for field in kinds[0].fields if field.required} == {
        "external_id",
        "revision",
        "name",
    }
    assert all(field.label for kind in kinds for field in kind.fields)


@pytest.mark.parametrize(
    "values",
    [
        {"url": "https://login:password@one-c.example/report"},
        {"url": "file:///etc/passwd"},
        {"url": "https://one-c.example/report#fragment"},
        {"url": "https://one-c.example/report?access_token=secret"},
        {"auth_env": "POSTGRES_PASSWORD"},
        {"column_mapping": {"a": "name", "b": "name"}},
        {"column_mapping": {"a": "unknown"}},
        {"column_mapping": {"a": "kind"}},
        {"column_mapping": {"": "name"}},
        {"items_path": "d..results"},
    ],
)
def test_invalid_profile_rejected(values):
    with pytest.raises(ValidationError):
        profile(**values)


def test_nested_mapping_exact_key_priority_nullable_values_and_discarded_columns():
    command = profile(
        items_path="d.results",
        column_mapping={
            "Номенклатура.Код": "external_id",
            "Version": "revision",
            "Display.Name": "name",
            "Updated": "source_updated_at",
        },
    )
    rows, errors, count = extract_rows(
        {
            "d": {
                "results": [
                    {
                        "Номенклатура.Код": "0001_",
                        "Номенклатура": {"Код": "wrong"},
                        "Version": 2,
                        "Display": {"Name": "Кабели"},
                        "Private": "SECRET",
                        "Updated": None,
                    }
                ]
            }
        },
        command,
    )
    assert count == 1 and errors == []
    assert rows[0]["data"]["external_id"] == "0001_"
    assert rows[0]["data"]["revision"] == 2
    assert "SECRET" not in str(rows)


@pytest.mark.parametrize("kind,field", [("stocks", "reserved"), ("sales", "status")])
def test_explicit_optional_mapping_cannot_silently_default_missing_source(kind, field):
    command = profile(kind=kind, column_mapping={"Expected": field})
    rows, errors, _ = extract_rows([{}], command)
    assert rows == []
    assert [error["column"] for error in errors] == [field]


def test_missing_required_and_invalid_revision_are_errors_without_fake_defaults():
    command = profile()
    rows, errors, count = extract_rows(
        [
            {"external_id": "c1", "revision": "PRIVATE", "name": "Name"},
            {"name": "Name"},
        ],
        command,
    )
    assert rows == [] and count == 2
    assert {error["column"] for error in errors} == {"external_id", "revision"}
    assert "PRIVATE" not in str(errors)


def test_explicit_quantity_sign_preserves_return_direction():
    command = profile(kind="sales", quantity_multiplier=-1)
    sale = dict(
        external_id="s1",
        revision=1,
        product_external_id="p1",
        warehouse_external_id="w1",
        date="2026-09-01",
        document_id="d1",
        line_id="1",
    )
    rows, errors, _ = extract_rows(
        [
            dict(sale, quantity="-10"),
            dict(sale, external_id="s2", quantity="2"),
        ],
        command,
    )
    assert not errors
    assert [row["data"]["quantity"] for row in rows] == ["10", "-2"]


@pytest.mark.parametrize(
    "payload,path",
    [
        ({"value": [], "@odata.nextLink": "https://other.example"}, "value"),
        ({"d": {"results": [], "__next": "page2"}}, "d.results"),
    ],
)
def test_incomplete_pages_rejected(payload, path):
    with pytest.raises(DomainError) as error:
        extract_rows(payload, profile(items_path=path))
    assert error.value.code == "incomplete_rest_page"


async def test_fetch_allowlist_denies_unlisted_origins_before_network():
    def handler(request):
        pytest.fail("Network must not be called")

    transport = httpx.MockTransport(handler)
    for allowed in ("", "https://one-c.example:8443", "https://other.example"):
        with pytest.raises(DomainError) as error:
            await fetch_report(profile(), allowed, transport)
        assert error.value.code == "rest_origin_not_allowed"


async def test_fetch_reads_secret_only_on_server_and_keeps_decimal_precision(monkeypatch):
    monkeypatch.setenv("ONEC_AUTH_TEST", "Bearer private-test-key")

    def handler(request):
        assert request.headers["Authorization"] == "Bearer private-test-key"
        assert request.headers["Accept-Encoding"] == "identity"
        return httpx.Response(200, content=b'[{"quantity":12345678901234.123456}]')

    result, checksum = await fetch_report(
        profile(auth_env="ONEC_AUTH_TEST"), "https://one-c.example", httpx.MockTransport(handler)
    )
    assert str(result[0]["quantity"]) == "12345678901234.123456"
    assert len(checksum) == 64
    assert "private-test-key" not in str(result)


@pytest.mark.parametrize("mapped", [False, True])
async def test_decimal_metadata_is_still_valid_json_without_losing_quantity_precision(mapped):
    content = (
        b'[{"external_id":"p1","revision":1,"sku":"sku","name":"Name","unit":"m",'
        b'"pack_size":12345678901234.123456,"data_quality":{"confidence":0.5}}]'
    )
    mapping = (
        {
            key: key
            for key in (
                "external_id",
                "revision",
                "sku",
                "name",
                "unit",
                "pack_size",
                "data_quality",
            )
        }
        if mapped
        else {}
    )
    command = profile(kind="products", column_mapping=mapping)
    payload, _ = await fetch_report(
        command,
        "https://one-c.example",
        httpx.MockTransport(lambda request: httpx.Response(200, content=content)),
    )
    rows, errors, _ = extract_rows(payload, command)
    assert not errors
    assert rows[0]["data"]["data_quality"]["confidence"] == 0.5
    assert rows[0]["data"]["pack_size"] == "12345678901234.123456"


@pytest.mark.parametrize(
    "response,code",
    [
        (
            httpx.Response(302, headers={"location": "http://127.0.0.1/private"}),
            "rest_upstream_error",
        ),
        (httpx.Response(401, text="PRIVATE upstream response"), "rest_upstream_error"),
        (httpx.Response(200, text="PRIVATE invalid JSON"), "invalid_rest_json"),
    ],
)
async def test_upstream_errors_and_redirects_are_safe(response, code):
    calls = []

    def handler(request):
        calls.append(request.url)
        return response

    with pytest.raises(DomainError) as error:
        await fetch_report(profile(), "https://one-c.example", httpx.MockTransport(handler))
    assert error.value.code == code
    assert "PRIVATE" not in error.value.detail
    assert len(calls) == 1


async def test_bounded_response_and_rows(monkeypatch):
    monkeypatch.setattr(report_service, "MAX_BYTES", 10)
    with pytest.raises(DomainError) as error:
        await fetch_report(
            profile(),
            "https://one-c.example",
            httpx.MockTransport(lambda request: httpx.Response(200, content=b"x" * 11)),
        )
    assert error.value.status_code == 413
    monkeypatch.setattr(report_service, "MAX_ROWS", 1)
    with pytest.raises(DomainError) as error:
        extract_rows([{}, {}], profile())
    assert error.value.code == "too_many_rows"


class MemoryReports:
    def __init__(self):
        self.source_id = uuid4()
        self.reports = {}

    async def source_exists(self, source_id):
        return source_id == self.source_id

    async def list(self, source_id):
        return [row for row in self.reports.values() if row.source_id == source_id]

    async def get(self, report_id):
        return self.reports.get(report_id)

    async def save(self, report, values):
        if report is None:
            report = SimpleNamespace(
                id=uuid4(), created_at=datetime.now(UTC), updated_at=datetime.now(UTC), **values
            )
            self.reports[report.id] = report
        else:
            report.__dict__.update(values)
        return report


def application(permissions):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    repository = MemoryReports()
    service = ReportService(repository, None, "")
    app.dependency_overrides[get_report_service] = lambda: service
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=uuid4(),
        has_permission=lambda code: code in permissions,
    )

    @app.exception_handler(DomainError)
    async def domain_error(request: Request, error: DomainError):
        return JSONResponse(
            status_code=error.status_code, content={"detail": error.detail, "code": error.code}
        )

    return app, repository


async def test_api_save_list_update_and_safe_unconfigured_preview():
    app, repository = application({"integrations.read", "integrations.write", "imports.write"})
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        root = "/api/v1/integrations/1c"
        response = await client.post(
            f"{root}/sources/{repository.source_id}/reports", json=profile().model_dump()
        )
        assert response.status_code == 201
        report = response.json()
        assert (await client.get(f"{root}/sources/{repository.source_id}/reports")).json() == [
            report
        ]
        changed = await client.put(
            f"{root}/reports/{report['id']}", json=profile(name="Changed").model_dump()
        )
        assert changed.json()["name"] == "Changed"
        assert changed.json()["id"] == report["id"]
        preview = await client.post(f"{root}/reports/{report['id']}/preview")
        assert preview.status_code == 422
        assert preview.json()["code"] == "rest_origin_not_allowed"
        assert (await client.get(f"{root}/report-kinds")).status_code == 200
        assert app.openapi()["paths"][f"{root}/reports/{{report_id}}/preview"]["post"]["responses"][
            "502"
        ]


@pytest.mark.parametrize("permissions", [{"integrations.write"}, {"imports.write"}])
async def test_preview_requires_both_permissions(permissions):
    app, _ = application(permissions)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(f"/api/v1/integrations/1c/reports/{uuid4()}/preview")
    assert response.status_code == 403
