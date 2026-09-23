from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.errors import DomainError
from app.Domains.DataImports import tasks
from app.Domains.DataImports.DTO.packages import PackageOptions
from app.Domains.DataImports.repositories.package_repository import PackageRepository
from app.Domains.DataImports.services.package_service import PackageService
from app.main import app


def test_package_options_require_explicit_safe_assumptions():
    options = PackageOptions()
    assert options.lead_time_days is None
    assert options.moq_semantics is None
    assert options.negative_sales_policy == "quarantine"
    assert options.warehouse_mapping == {}
    for value in (
        {"lead_time_days": -1},
        {"history_start": "2027-01-01"},
        {"purchase_conversions": {"001_": 0}},
        {
            "stock_overrides": {
                "001_": {"quantity": 1, "reserved": 2, "warehouse": "А", "as_of": "2026-09-22"}
            }
        },
        {"server_path": "/tmp/private.xlsx"},
    ):
        with pytest.raises(ValidationError):
            PackageOptions.model_validate(value)


def test_package_preview_validates_rows_and_rejects_duplicate_identities(monkeypatch):
    row = {"kind": "suppliers", "external_id": "supplier", "revision": 1, "name": "IEK"}
    monkeypatch.setattr(tasks, "parse_partner_files", lambda files, options: {"rows": [row, row]})
    with pytest.raises(DomainError, match="повтор идентификатора"):
        tasks.prepare([], {})


def test_poll_resource_does_not_load_raw_evidence_or_private_storage_keys():
    package = SimpleNamespace(
        id=uuid4(),
        source_id=uuid4(),
        name="Test",
        status="validated",
        job_id=uuid4(),
        files=[
            {
                "name": "MOQ.xlsx",
                "size": 200,
                "sha256": "a" * 64,
                "storage_key": "private/object.xlsx",
            }
        ],
        options={},
        summary={"control_counts": {"fact_provenance": 248000}},
        row_count=250000,
        processed_rows=0,
        issue_count=2,
        error=None,
        created_at=datetime.now(UTC),
        applied_at=None,
    )
    result = PackageService.resource(package).model_dump(mode="json")
    assert result["controls"] == {"fact_provenance": 248000}
    assert "storage_key" not in result["files"][0]
    assert "issues" not in result


def test_openapi_documents_async_multipart_and_options():
    schema = app.openapi()
    route = schema["paths"]["/api/v1/imports/packages"]["post"]
    assert "multipart/form-data" in route["requestBody"]["content"]
    assert {"202", "409", "413", "415", "422"}.issubset(route["responses"])
    assert "PackageOptions" in schema["components"]["schemas"]
    assert "/api/v1/imports/packages/{package_id}/products" in schema["paths"]


def test_two_different_books_of_one_profile_cannot_hide_changed_sales(monkeypatch):
    monkeypatch.setattr(
        tasks,
        "parse_partner_files",
        lambda files, options: {
            "rows": [],
            "files": [
                {"filename": "changed.xlsx", "profile": "iek.dynamics", "sha256": "changed"},
                {"filename": "original.xlsx", "profile": "iek.dynamics", "sha256": "original"},
            ],
        },
    )
    with pytest.raises(DomainError, match="одного профиля"):
        tasks.prepare([], {})


async def test_apply_guard_rejects_ambiguous_manifest_before_loading_source_history():
    package = SimpleNamespace(
        files=[
            {"profile": "iek.inbound", "sha256": "changed"},
            {"profile": "iek.inbound", "sha256": "original"},
        ]
    )
    with pytest.raises(DomainError, match="одного профиля"):
        await PackageRepository(None).guard_fact_replacement(package)
