import pytest
from pydantic import ValidationError

from app.Domains.DataImports.DTO.rows import ProductRow


def test_legacy_product_serialization_preserves_import_hash():
    row = ProductRow(external_id="p", revision=1, sku="s", name="n", unit="шт")
    assert "data_quality" not in row.model_dump(mode="json")
    row.data_quality = {"status": "blocked", "reasons": ["missing_conditions"]}
    assert row.model_dump(mode="json")["data_quality"]["status"] == "blocked"


@pytest.mark.parametrize(
    "quality", [{"history_start": "yesterday"}, {"reasons": "missing"}, {"stock_max_age_days": -1}]
)
def test_bad_quality_cannot_break_calculation(quality):
    with pytest.raises(ValidationError):
        ProductRow(external_id="p", revision=1, sku="s", name="n", unit="шт", data_quality=quality)
