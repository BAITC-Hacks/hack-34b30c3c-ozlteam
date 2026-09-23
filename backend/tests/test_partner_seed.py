import hashlib
import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.Domains.DataImports.DTO.packages import PackageOptions
from app.seed.partner_workbooks import MANIFEST, load_seed_files, seed_package, verify_counts


def test_manifest_pins_safe_options_and_full_import_counts():
    manifest = json.loads(MANIFEST.read_text())
    assert len(manifest["files"]) == 12
    assert len({row["path"] for row in manifest["files"]}) == 12
    assert manifest["options"] == PackageOptions().model_dump(mode="json")
    assert manifest["expected"]["products"] == 3908
    assert manifest["expected"]["sales"] == 248467
    assert sum(v for k, v in manifest["expected"].items() if k != "rows") == 252385


def tiny_manifest(tmp_path):
    manifest = json.loads(MANIFEST.read_text())
    content = b"pinned workbook fixture"
    manifest["files"] = [
        {"path": "test.xlsx", "size": len(content), "sha256": hashlib.sha256(content).hexdigest()}
    ]
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest))
    (tmp_path / "test.xlsx").write_bytes(content)
    return path


def test_changed_or_missing_originals_fail_before_import(tmp_path):
    manifest_path = tiny_manifest(tmp_path)
    _, files, options = load_seed_files(tmp_path, manifest_path)
    assert files == [("test.xlsx", b"pinned workbook fixture")]
    assert options.lead_time_days is None
    (tmp_path / "test.xlsx").write_bytes(b"modified workbook test")
    with pytest.raises(ValueError, match="отличается"):
        load_seed_files(tmp_path, manifest_path)
    (tmp_path / "test.xlsx").unlink()
    with pytest.raises(ValueError, match="Не найдена"):
        load_seed_files(tmp_path, manifest_path)


def test_manifest_cannot_escape_input_directory(tmp_path):
    manifest_path = tiny_manifest(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    manifest["files"][0]["path"] = "../outside.xlsx"
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Недопустимый путь"):
        load_seed_files(tmp_path, manifest_path)


class FakeWorker:
    def __init__(self, states):
        self.states = iter(states)
        self.package = SimpleNamespace(
            id=uuid4(),
            source_id=uuid4(),
            row_count=3,
            processed_rows=0,
            error="worker error",
            summary={"by_kind": {}},
        )
        self.applied = self.retried = 0
        self.stage_calls = []

    def advance(self):
        self.package.status = next(self.states)
        if self.package.status == "applied":
            self.package.processed_rows = self.package.row_count
        return self.package

    async def stage(self, files, options, source_id, name, user_id):
        self.stage_calls.append((files, options, source_id, name, user_id))
        return self.advance()

    async def get(self, identifier):
        assert identifier == self.package.id
        return self.advance()

    def resource(self, package):
        return package

    async def apply(self, identifier, user_id):
        assert identifier == self.package.id
        self.applied += 1
        return self.advance()

    async def retry(self, identifier, user_id):
        assert identifier == self.package.id
        self.retried += 1
        return self.advance()

    @asynccontextmanager
    async def scope(self):
        yield self


async def seed(worker, **kwargs):
    return await seed_package(
        {"name": "Test", "expected": {"rows": 3}},
        [("book.xlsx", b"test")],
        PackageOptions(),
        uuid4(),
        service_scope=worker.scope,
        progress=lambda *args, **kwargs: None,
        poll_interval=0,
        **kwargs,
    )


async def test_seed_applies_only_after_validation_and_reuses_existing_package():
    worker = FakeWorker(["queued", "parsing", "validated", "applying", "applied"])
    result = await seed(worker)
    assert result.id == worker.package.id
    assert worker.applied == 1
    assert worker.retried == 0
    # No explicit new source: reuse the same canonical source as manual UI imports.
    assert worker.stage_calls[0][2] is None
    repeated = FakeWorker(["applied"])
    repeated.package.id = result.id
    assert (await seed(repeated)).id == result.id
    assert repeated.applied == 0


async def test_failure_is_reported_without_silent_retry():
    worker = FakeWorker(["queued", "failed"])
    with pytest.raises(RuntimeError, match="worker error"):
        await seed(worker, retry_failed=True)
    assert worker.retried == 0
    assert worker.applied == 0


async def test_explicit_retry_resumes_existing_failure_only_once():
    worker = FakeWorker(["failed", "applying", "applied"])
    result = await seed(worker, retry_failed=True)
    assert worker.retried == 1
    assert result.status == "applied"
    failed_again = FakeWorker(["failed", "applying", "failed"])
    with pytest.raises(RuntimeError, match="worker error"):
        await seed(failed_again, retry_failed=True)
    assert failed_again.retried == 1


async def test_timeout_does_not_claim_or_cancel_worker_job():
    worker = FakeWorker(["queued"])
    with pytest.raises(TimeoutError, match="не отменена"):
        await seed(worker, timeout=0)
    assert worker.package.status == "queued"
    assert worker.applied == worker.retried == 0


async def test_applied_package_with_changed_counts_does_not_report_success():
    worker = FakeWorker(["applied"])
    worker.package.row_count = 4
    with pytest.raises(RuntimeError, match="Число строк отличается"):
        await seed(worker)
    assert worker.applied == 0


async def test_changed_parser_count_is_rejected_before_applying_any_rows():
    worker = FakeWorker(["validated"])
    worker.package.row_count = 4
    with pytest.raises(RuntimeError, match="Число строк отличается"):
        await seed(worker)
    assert worker.applied == 0


def test_each_expected_entity_count_is_checked_not_only_total():
    package = SimpleNamespace(
        status="validated", row_count=3, summary={"by_kind": {"products": 1, "sales": 2}}
    )
    verify_counts(package, {"rows": 3, "products": 1, "sales": 2})
    with pytest.raises(RuntimeError, match="products: 1 вместо 2"):
        verify_counts(package, {"rows": 3, "products": 2, "sales": 1})
