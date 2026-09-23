import asyncio
from collections import Counter
from datetime import UTC, datetime
from uuid import UUID

import structlog

from app.core.database import session_factory
from app.core.errors import DomainError
from app.Domains.DataImports.adapters.partner_workbooks import parse_partner_files
from app.Domains.DataImports.DTO.rows import KINDS, ROW_ADAPTER
from app.Domains.DataImports.repositories.package_repository import PackageRepository
from app.Domains.DataImports.services.package_rules import validate_profile_manifest
from app.Domains.Files.dependencies import get_file_storage
from app.Domains.Integrations1C.DTO.exchange import ExchangeCommand
from app.Domains.Jobs.dependencies import open_job_service

logger = structlog.get_logger(__name__)


def prepare(files, options):
    parsed = parse_partner_files(files, options)
    validate_profile_manifest(parsed.get("files", []))
    # One canonical schema for file and push exchange; retain legitimate signed returns.
    parsed["rows"] = [
        ROW_ADAPTER.validate_python(row).model_dump(mode="json") for row in parsed["rows"]
    ]
    parsed["rows"].sort(key=lambda row: KINDS.index(row["kind"]))
    identities = [(row["kind"], row["external_id"]) for row in parsed["rows"]]
    if len(set(identities)) != len(identities):
        raise DomainError("Профиль создал повтор идентификатора", 422, "duplicate_source_row")
    return parsed


async def mark_failed(identifier, job_identifier, error):
    message = (
        error.detail
        if isinstance(error, DomainError)
        else "Ошибка обработки пакета; повторите операцию"
    )
    logger.error(
        "import_package.failed", package_id=str(identifier), error_type=type(error).__name__
    )
    async with session_factory() as session, session.begin():
        package = await PackageRepository(session).get(identifier, lock=True)
        if package is not None and package.job_id == job_identifier and package.status != "applied":
            package.status = "failed"
            package.error = message[:1000]
    async with open_job_service() as jobs:
        await jobs.fail(job_identifier, message)


async def parse_import_package(ctx: dict, job_id: str, package_id: str):
    identifier, job_identifier = UUID(package_id), UUID(job_id)
    try:
        async with open_job_service() as jobs:
            await jobs.start(job_identifier)
        async with session_factory() as session, session.begin():
            package = await PackageRepository(session).get(identifier, lock=True)
            if package is None or package.job_id != job_identifier:
                return
            if package.status in ("validated", "applied", "applying"):
                async with open_job_service() as jobs:
                    await jobs.finish(job_identifier, {"package_id": package_id})
                return
            package.status, package.error = "parsing", None
            metadata, options = package.files, package.options
        storage = get_file_storage()
        files = []
        for item in metadata:
            stream = await storage.open(item["storage_key"])
            files.append((item["name"], b"".join([chunk async for chunk in stream])))
        async with open_job_service() as jobs:
            await jobs.complete_step(job_identifier, "Читаю исходные книги")
        parsed = await asyncio.to_thread(prepare, files, options)
        del files
        async with open_job_service() as jobs:
            await jobs.complete_step(job_identifier, "Сопоставляю и проверяю данные")
        async with session_factory() as session, session.begin():
            repository = PackageRepository(session)
            package = await repository.get(identifier, lock=True)
            if package.job_id != job_identifier:
                return
            await repository.replace_chunks(identifier, parsed["rows"])
            await repository.replace_evidence(identifier, parsed.get("controls", []))
            package.row_count = len(parsed["rows"])
            package.issues = parsed.get("issues", [])
            package.issue_count = len(package.issues)
            package.products = parsed.get("products", [])
            package.summary = parsed.get("summary", {}) | {
                "control_counts": dict(
                    Counter(row.get("kind", "other") for row in parsed.get("controls", []))
                )
            }
            manifest = {
                item.get("filename", item.get("name")): item for item in parsed.get("files", [])
            }
            package.files = [
                item
                | {
                    key: value
                    for key, value in manifest.get(item["name"], {}).items()
                    if key in {"profile", "row_count"}
                }
                for item in package.files
            ]
            package.status = "validated"
        async with open_job_service() as jobs:
            await jobs.finish(job_identifier, {"package_id": package_id})
    except Exception as error:
        await mark_failed(identifier, job_identifier, error)


async def apply_import_package(ctx: dict, job_id: str, package_id: str):
    identifier, job_identifier = UUID(package_id), UUID(job_id)
    try:
        async with open_job_service() as jobs:
            await jobs.start(job_identifier)
        while True:
            async with session_factory() as session, session.begin():
                repository = PackageRepository(session)
                package = await repository.get(identifier, lock=True)
                if package is None or package.job_id != job_identifier:
                    return
                if package.status == "applied":
                    break
                source = await repository.source(package.source_id, lock=True)
                if source.revision != package.expected_revision:
                    raise DomainError(
                        "Источник изменён другой операцией; требуется новая проверка",
                        409,
                        "source_conflict",
                    )
                chunk = await repository.next_chunk(identifier)
                if chunk is None:
                    raise DomainError(
                        "Не найдены строки незавершённого пакета", 409, "missing_package_chunk"
                    )
                final = package.processed_rows + len(chunk.rows) == package.row_count
                command = ExchangeCommand(
                    batch_key=f"package:{identifier}:{chunk.position}",
                    expected_revision=package.expected_revision,
                    cursor=f"package:{identifier}:{chunk.position}",
                    complete=final,
                    rows=chunk.rows,
                )
                result = await repository.bulk_exchange(source, command, package.created_by)
                package.expected_revision = result.revision
                package.processed_rows += len(chunk.rows)
                package.error = None
                chunk.applied = True
                if final:
                    package.status = "applied"
                    package.applied_at = datetime.now(UTC)
            if final:
                break
        async with open_job_service() as jobs:
            await jobs.finish(job_identifier, {"package_id": package_id})
    except Exception as error:
        await mark_failed(identifier, job_identifier, error)
