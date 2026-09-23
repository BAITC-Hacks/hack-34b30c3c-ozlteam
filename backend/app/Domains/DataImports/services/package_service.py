import hashlib
from pathlib import Path
from uuid import UUID

from app.core.errors import DomainError
from app.Domains.DataImports.DTO.packages import PackageOptions
from app.Domains.DataImports.resources.packages import PackageResource
from app.Domains.DataImports.services.exchange_service import digest

PARSE_PACKAGE = "parse_import_package"
APPLY_PACKAGE = "apply_import_package"
MAX_FILES = 20
MAX_FILE_BYTES = 25 * 1024 * 1024
DEFAULT_SOURCE_NAME = "Тестовые выгрузки 1С Электрокомплект"


class PackageService:
    def __init__(self, repository, storage=None, jobs=None):
        self.repository = repository
        self.storage = storage
        self.jobs = jobs

    @staticmethod
    def resource(package):
        return PackageResource(
            id=package.id,
            source_id=package.source_id,
            name=package.name,
            status=package.status,
            job_id=package.job_id,
            files=package.files,
            options=package.options,
            summary=package.summary,
            controls=package.summary.get("control_counts", {}),
            row_count=package.row_count,
            processed_rows=package.processed_rows,
            issue_count=package.issue_count,
            error=package.error,
            created_at=package.created_at,
            applied_at=package.applied_at,
        )

    async def get(self, identifier: UUID, lock=False):
        package = await self.repository.get(identifier, lock=lock)
        if package is None:
            raise DomainError("Пакет импорта не найден", 404, "package_not_found")
        return package

    async def list(self, limit, offset):
        rows, total = await self.repository.list(limit, offset)
        return dict(items=[self.resource(p) for p in rows], total=total, limit=limit, offset=offset)

    async def items(self, identifier, field, limit, offset, q=None, status=None, supplier=None):
        await self.get(identifier)
        rows = await self.repository.entries(identifier, field) or []
        if q:
            query = q.casefold()
            rows = [
                row
                for row in rows
                if any(
                    query in str(row.get(key, "")).casefold()
                    for key in ("code", "name", "product_code", "message")
                )
            ]
        if status:
            rows = [row for row in rows if row.get("status", row.get("severity")) == status]
        if supplier:
            rows = [row for row in rows if row.get("supplier") == supplier]
        return dict(
            items=rows[offset : offset + limit], total=len(rows), limit=limit, offset=offset
        )

    async def stage(self, files, options: PackageOptions, source_id, name, user_id):
        if not 1 <= len(files) <= MAX_FILES:
            raise DomainError("Передайте от 1 до 20 книг XLSX", 422, "invalid_package_files")
        names = [Path(filename).name for filename, _ in files]
        if len(set(names)) != len(names):
            raise DomainError("Имена книг в пакете должны различаться", 422, "duplicate_filename")
        metadata = []
        for (filename, content), safe_name in zip(files, names, strict=True):
            if Path(filename).suffix.lower() != ".xlsx":
                raise DomainError(
                    "Профиль исходных отчётов принимает XLSX", 415, "unsupported_file_type"
                )
            if not content or len(content) > MAX_FILE_BYTES:
                raise DomainError("Книга пуста или превышает 25 МиБ", 413, "file_too_large")
            metadata.append(
                dict(
                    name=safe_name[:255],
                    size=len(content),
                    sha256=hashlib.sha256(content).hexdigest(),
                )
            )
        normalized = options.model_dump(mode="json")
        if source_id is not None:
            source = await self.repository.source(source_id)
            if source is None:
                raise DomainError("Источник не найден", 404, "source_not_found")
        else:
            source = await self.repository.create_source(DEFAULT_SOURCE_NAME)
        fingerprint = digest(
            dict(
                source_id=str(source.id),
                options=normalized,
                files=sorted(metadata, key=lambda f: f["name"]),
            )
        )
        await self.repository.lock_fingerprint(fingerprint)
        existing = await self.repository.by_fingerprint(fingerprint)
        if existing is not None:
            return self.resource(existing)
        package = await self.repository.add(
            source_id=source.id,
            name=name,
            fingerprint=fingerprint,
            options=normalized,
            files=metadata,
            created_by=user_id,
        )
        saved = []
        try:
            # The just-flushed ORM JSON value must not be mutated in place: otherwise
            # assigning an equal copy is not dirty and storage keys never reach the DB.
            metadata = [dict(item) for item in metadata]
            for index, (_, content) in enumerate(files):
                key = f"{package.id}/original-{index}.xlsx"

                async def chunks(data=content):
                    yield data

                await self.storage.save(key, chunks())
                saved.append(key)
                metadata[index]["storage_key"] = key
            package.files = [dict(item) for item in metadata]
            job = await self.jobs.enqueue(PARSE_PACKAGE, {"package_id": str(package.id)}, user_id)
            package.job_id = job.id
            await self.repository.flush()
        except Exception:
            for key in saved:
                await self.storage.delete(key)
            raise
        return self.resource(package)

    async def apply(self, identifier, user_id):
        package = await self.get(identifier, lock=True)
        if package.status in ("applied", "applying"):
            return self.resource(package)
        if package.status != "validated":
            raise DomainError("Сначала завершите проверку пакета", 409, "package_not_validated")
        if not package.row_count:
            raise DomainError("В пакете нет применимых строк", 422, "empty_package")
        source = await self.repository.source(package.source_id, lock=True)
        await self.repository.guard_fact_replacement(package)
        if await self.repository.active_for_source(source.id, package.id):
            raise DomainError(
                "Применение другого пакета этого источника не завершено", 409, "package_in_progress"
            )
        package.expected_revision = source.revision
        source.complete = False
        package.status = "applying"
        job = await self.jobs.enqueue(APPLY_PACKAGE, {"package_id": str(package.id)}, user_id)
        package.job_id = job.id
        await self.repository.flush()
        return self.resource(package)

    async def retry(self, identifier, user_id):
        package = await self.get(identifier, lock=True)
        if package.status != "failed":
            raise DomainError("Повтор доступен для ошибочного пакета", 409, "package_not_failed")
        applying = package.expected_revision is not None
        package.status = "applying" if applying else "queued"
        package.error = None
        job = await self.jobs.enqueue(
            APPLY_PACKAGE if applying else PARSE_PACKAGE, {"package_id": str(package.id)}, user_id
        )
        package.job_id = job.id
        await self.repository.flush()
        return self.resource(package)
