import io
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from openpyxl import Workbook
from pydantic import ValidationError

from app.core.errors import DomainError
from app.Domains.DataImports.DTO.rows import ROW_ADAPTER, SaleRow
from app.Domains.DataImports.services.exchange_service import ExchangeService, check_revision
from app.Domains.DataImports.services.parser import parse_file
from app.Domains.Integrations1C.DTO.exchange import ExchangeCommand


def test_csv_validates_all_rows_and_reports_location_without_raw_inputs():
    content = b"external_id,revision,name\n001,1,One\n002,no,Two\n"
    rows, errors, count = parse_file("categories.csv", content, "categories", {})
    assert count == 2
    assert rows[0]["data"]["external_id"] == "001"
    assert errors[0]["sheet"] == "CSV"
    assert errors[0]["row"] == 3
    assert errors[0]["column"] == "revision"
    assert "input" not in errors[0]


def test_mapping_discards_personal_columns_before_staging():
    content = "Код;Версия;Название;ФИО\n0001;1;Кабели;Secret Name\n".encode()
    rows, errors, _ = parse_file(
        "input.csv",
        content,
        "categories",
        {
            "Код": "external_id",
            "Версия": "revision",
            "Название": "name",
        },
    )
    assert not errors
    assert "Secret" not in str(rows)
    assert rows[0]["data"]["external_id"] == "0001"


def test_file_cannot_override_selected_kind():
    content = b"kind,external_id,revision,name\nsuppliers,s1,1,Supplier\n"
    rows, errors, _ = parse_file("sales.csv", content, "sales", {})
    assert rows == []
    assert errors[0]["column"] == "kind"


def test_xlsx_reads_all_sheets_preserves_text_codes_and_rejects_formula():
    book = Workbook()
    sheet = book.active
    sheet.append(["external_id", "revision", "name"])
    sheet.append(["000123_", 1, "Cable"])
    another = book.create_sheet("Invalid")
    another.append(["external_id", "revision", "name"])
    another.append(["0002", "=1+1", "Cable"])
    output = io.BytesIO()
    book.save(output)
    rows, errors, count = parse_file("data.xlsx", output.getvalue(), "categories", {})
    assert rows[0]["data"]["external_id"] == "000123_"
    assert count == 2
    assert errors[0]["sheet"] == "Invalid"


def test_unknown_client_is_nullable_and_negative_source_sign_is_explicit():
    header = (
        "external_id,revision,product_external_id,warehouse_external_id,date,"
        "document_id,line_id,quantity\n"
    )
    content = (header + "s1,1,p1,w1,2026-09-01,d1,l1,-12\n").encode()
    raw, errors, _ = parse_file("sales.csv", content, "sales", {})
    assert not errors
    assert raw[0]["data"]["quantity"] == "-12"
    assert raw[0]["data"]["client_id"] is None
    adjusted, errors, _ = parse_file("sales.csv", content, "sales", {}, -1)
    assert not errors
    assert adjusted[0]["data"]["quantity"] == "12"


def test_stock_reserve_and_dates_validated():
    data = dict(
        kind="stocks",
        external_id="s1",
        revision=1,
        product_external_id="p1",
        warehouse_external_id="w1",
        as_of="2026-09-01T10:00:00+05:00",
        quantity="3",
        reserved="4",
    )
    with pytest.raises(ValidationError, match="Резерв"):
        ROW_ADAPTER.validate_python(data)
    data["reserved"] = "2"
    data["as_of"] = "2026-09-01T10:00:00"
    with pytest.raises(ValidationError, match="timezone"):
        ROW_ADAPTER.validate_python(data)


def test_client_identity_field_rejects_email_and_extra_personal_fields():
    sale = dict(
        external_id="s",
        revision=1,
        product_external_id="p",
        warehouse_external_id="w",
        date="2026-09-01",
        document_id="d",
        line_id="l",
        quantity=Decimal(1),
    )
    with pytest.raises(ValidationError):
        SaleRow(**sale, client_id="someone@example.com")
    with pytest.raises(ValidationError):
        SaleRow(**sale, client_name="Secret")


def test_revision_rules_reject_stale_and_conflicting_payload():
    assert not check_revision(3, "same", 3, "same")
    assert check_revision(3, "old", 4, "new")
    with pytest.raises(DomainError) as conflict:
        check_revision(3, "old", 3, "different")
    assert conflict.value.code == "source_revision_conflict"
    with pytest.raises(DomainError) as stale:
        check_revision(3, "old", 2, "old")
    assert stale.value.code == "stale_source_revision"


class FakeRepository:
    def __init__(self):
        self.source_record = SimpleNamespace(id=uuid4(), revision=0)
        self.records = {}
        self.batches = {}
        self.writes = 0

    async def source(self, source_id, lock=False):
        return self.source_record

    async def batch(self, source_id, key):
        return self.batches.get(key)

    async def record(self, kind, source_id, external_id):
        return self.records.get((kind, external_id))

    async def natural_conflict(self, kind, values):
        return False

    async def write(self, kind, existing, values):
        record = existing or SimpleNamespace(id=uuid4())
        record.__dict__.update(values)
        self.records[(kind, values["external_id"])] = record
        self.writes += 1

    async def finish_exchange(self, source, command, user_id, payload_hash, summary):
        source.revision += 1
        batch = SimpleNamespace(
            id=uuid4(), payload_hash=payload_hash, revision=source.revision, summary=summary
        )
        self.batches[command.batch_key] = batch
        return batch


async def test_exchange_replay_and_revision_update_preserve_identity():
    repo = FakeRepository()
    service = ExchangeService(repo)
    command = ExchangeCommand(
        batch_key="b1",
        expected_revision=0,
        complete=True,
        rows=[dict(kind="categories", external_id="c1", revision=1, name="Old")],
    )
    result = await service.apply(repo.source_record.id, command, uuid4())
    original_id = repo.records[("categories", "c1")].id
    assert await service.apply(repo.source_record.id, command, uuid4()) is result
    assert repo.writes == 1
    updated = ExchangeCommand(
        batch_key="b2",
        expected_revision=1,
        complete=True,
        rows=[dict(kind="categories", external_id="c1", revision=2, name="New")],
    )
    await service.apply(repo.source_record.id, updated, uuid4())
    assert repo.records[("categories", "c1")].id == original_id
    assert repo.records[("categories", "c1")].name == "New"


async def test_exchange_key_reuse_rejects_changed_data():
    repo = FakeRepository()
    service = ExchangeService(repo)
    command = ExchangeCommand(
        batch_key="b1",
        expected_revision=0,
        complete=True,
        rows=[dict(kind="categories", external_id="c1", revision=1, name="Old")],
    )
    await service.apply(repo.source_record.id, command, uuid4())
    command.rows[0].name = "Changed"
    with pytest.raises(DomainError) as error:
        await service.apply(repo.source_record.id, command, uuid4())
    assert error.value.code == "batch_conflict"
    assert repo.writes == 1
