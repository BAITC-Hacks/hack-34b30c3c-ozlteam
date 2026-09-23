from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.Domains.Catalogs.DTO.manual import ManualCreate, ManualPatch
from app.main import app


@pytest.mark.parametrize(
    "payload",
    [
        {"name": " "},
        {"name": "test", "pack_size": "0"},
        {"name": "test", "min_order_qty": "-1"},
        {"name": "test", "lead_time_days": 731},
        {"name": "test", "review_days": 0},
        {"name": "test", "unit": None},
        {"name": "test", "source_revision": 99},
        {"name": "test", "external_id": "fake"},
    ],
)
def test_manual_create_rejects_invalid_fields(payload):
    with pytest.raises(ValidationError):
        ManualCreate.model_validate(payload)


def test_patch_requires_aware_timestamp_and_cannot_change_identity():
    with pytest.raises(ValidationError):
        ManualPatch(active=False)
    with pytest.raises(ValidationError):
        ManualPatch(expected_updated_at="2026-01-01T00:00:00", active=False)
    with pytest.raises(ValidationError):
        ManualPatch(expected_updated_at=datetime.now(UTC), source_id="fake")


def test_manual_openapi_exposes_business_fields_and_preserves_exchange_contract():
    schema = app.openapi()
    paths = schema["paths"]
    create = paths["/api/v1/catalogs/{kind}/manual"]["post"]
    patch = paths["/api/v1/catalogs/{kind}/{record_id}/manual"]["patch"]
    assert create["security"] == [{"HTTPBearer": []}]
    assert {"201", "401", "403", "404", "409", "422"} <= create["responses"].keys()
    assert patch["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "ManualPatch"
    )
    original = paths["/api/v1/catalogs/{kind}"]["post"]
    assert original["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "CatalogCommand"
    )
