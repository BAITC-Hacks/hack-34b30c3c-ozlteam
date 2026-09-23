import asyncio
import hashlib
from pathlib import Path
from uuid import UUID

from app.core.errors import DomainError
from app.Domains.DataImports.DTO.rows import ROW_ADAPTER
from app.Domains.DataImports.repositories.data_repository import REFERENCES, DataRepository
from app.Domains.DataImports.resources.imports import ImportDetail, ImportResource
from app.Domains.DataImports.services.exchange_service import (
    ExchangeService,
    check_revision,
    digest,
)
from app.Domains.DataImports.services.parser import parse_file
from app.Domains.Integrations1C.DTO.exchange import ExchangeCommand


class ImportService:
    def __init__(self, repository: DataRepository):
        self.repository = repository

    async def stage(self, source_id, filename, content, kind, mapping, multiplier, user_id):
        source = await self.repository.source(source_id, lock=True)
        if source is None:
            raise DomainError("Источник не найден", status_code=404, code="source_not_found")
        rows, errors, count = await asyncio.to_thread(
            parse_file, filename, content, kind, mapping, multiplier
        )
        seen = set()
        for entry in rows:
            data = entry["data"]
            row = ROW_ADAPTER.validate_python(data)
            issues = []
            if row.external_id in seen:
                issues.append(("external_id", "Повтор идентификатора строки в файле"))
            seen.add(row.external_id)
            existing = await self.repository.record(kind, source_id, row.external_id)
            if existing is not None:
                try:
                    check_revision(
                        existing.source_revision, existing.payload_hash, row.revision, digest(data)
                    )
                except DomainError as exc:
                    issues.append(("revision", str(exc)))
            for field in REFERENCES:
                if data.get(field) is not None:
                    _, identifier = await self.repository.resolve(field, data[field], source_id)
                    if identifier is None:
                        issues.append((field, "Ссылка не найдена в справочнике источника"))
            errors.extend(
                dict(sheet=entry["sheet"], row=entry["row"], column=field, message=message)
                for field, message in issues
            )
        batch = await self.repository.create_import(
            source_id=source_id,
            filename=Path(filename).name[:255],
            kind=kind,
            file_hash=hashlib.sha256(content).hexdigest(),
            base_revision=source.revision,
            status="invalid" if errors else "validated",
            rows=rows,
            errors=errors,
            row_count=count,
            created_by=user_id,
        )
        return self.detail(batch)

    async def list(self, limit, offset):
        return [
            ImportResource.model_validate(b) for b in await self.repository.imports(limit, offset)
        ]

    async def get(self, batch_id):
        batch = await self.repository.get_import(batch_id)
        if batch is None:
            raise DomainError("Импорт не найден", status_code=404, code="import_not_found")
        return self.detail(batch)

    @staticmethod
    def detail(batch):
        return ImportDetail(
            **ImportResource.model_validate(batch).model_dump(),
            preview=[r["data"] for r in batch.rows[:20]],
        )

    async def apply(self, batch_id: UUID, user_id: UUID, complete: bool = False):
        batch = await self.repository.get_import(batch_id, lock=True)
        if batch is None:
            raise DomainError("Импорт не найден", status_code=404, code="import_not_found")
        if batch.status == "applied":
            return self.detail(batch)
        if batch.errors:
            raise DomainError(
                "Импорт содержит ошибки; загрузите исправленный файл",
                status_code=422,
                code="invalid_import",
            )
        source = await self.repository.source(batch.source_id, lock=True)
        command = ExchangeCommand(
            batch_key=f"import:{batch.id}",
            expected_revision=batch.base_revision,
            complete=complete,
            cursor=source.cursor,
            rows=[r["data"] for r in batch.rows],
        )
        await ExchangeService(self.repository).apply(batch.source_id, command, user_id)
        await self.repository.mark_applied(batch)
        return self.detail(batch)
