import hashlib
import json
from uuid import UUID

from app.core.errors import DomainError
from app.Domains.DataImports.DTO.rows import KINDS
from app.Domains.DataImports.repositories.data_repository import REFERENCES, DataRepository
from app.Domains.Integrations1C.DTO.exchange import ExchangeCommand


def digest(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def check_revision(existing_revision, existing_hash, revision, payload_hash):
    if revision < existing_revision:
        raise DomainError(
            "Устаревшая версия объекта источника", status_code=409, code="stale_source_revision"
        )
    if revision == existing_revision:
        if payload_hash != existing_hash:
            raise DomainError(
                "Одна версия объекта содержит разные данные",
                status_code=409,
                code="source_revision_conflict",
            )
        return False
    return True


class ExchangeService:
    def __init__(self, repository: DataRepository):
        self.repository = repository

    async def apply_catalog(self, command, user_id: UUID) -> UUID:
        """Public catalog mutation contract; preserve source completeness and cursor."""
        source = await self.repository.source(command.source_id, lock=True)
        if source is None:
            raise DomainError("Источник не найден", status_code=404, code="source_not_found")
        kind = command.row.kind
        await self.apply(
            command.source_id,
            ExchangeCommand(
                batch_key=(
                    f"catalog:{kind}:"
                    f"{hashlib.sha256(command.row.external_id.encode()).hexdigest()}:"
                    f"{command.row.revision}"
                ),
                expected_revision=command.expected_revision,
                cursor=source.cursor,
                complete=source.complete,
                rows=[command.row],
            ),
            user_id,
        )
        record = await self.repository.record(kind, command.source_id, command.row.external_id)
        return record.id

    async def apply(self, source_id: UUID, command: ExchangeCommand, user_id: UUID):
        source = await self.repository.source(source_id, lock=True)
        if source is None:
            raise DomainError("Источник не найден", status_code=404, code="source_not_found")
        payload_hash = digest(command.model_dump(mode="json"))
        previous = await self.repository.batch(source_id, command.batch_key)
        if previous is not None:
            if previous.payload_hash != payload_hash:
                raise DomainError(
                    "Ключ пакета уже использован для других данных",
                    status_code=409,
                    code="batch_conflict",
                )
            return previous
        if source.revision != command.expected_revision:
            raise DomainError(
                "Версия источника изменилась; обновите данные и повторите проверку",
                status_code=409,
                code="source_conflict",
            )
        identities = [(r.kind, r.external_id) for r in command.rows]
        if len(set(identities)) != len(identities):
            raise DomainError(
                "В пакете повторяются идентификаторы объектов",
                status_code=422,
                code="duplicate_source_row",
            )
        summary = {"created": 0, "updated": 0, "unchanged": 0}
        # Catalogs precede referenced facts, independent of input row order.
        for row in sorted(command.rows, key=lambda r: KINDS.index(r.kind)):
            existing = await self.repository.record(row.kind, source_id, row.external_id)
            row_hash = digest(row.model_dump(mode="json"))
            if existing is not None and not check_revision(
                existing.source_revision, existing.payload_hash, row.revision, row_hash
            ):
                summary["unchanged"] += 1
                continue
            values = row.model_dump(exclude={"kind", "revision"})
            values.update(source_id=source_id, source_revision=row.revision, payload_hash=row_hash)
            for field in REFERENCES:
                if field not in values:
                    continue
                external_id = values.pop(field)
                if external_id is None:
                    values[REFERENCES[field][1]] = None
                    continue
                target, reference_id = await self.repository.resolve(field, external_id, source_id)
                if reference_id is None:
                    raise DomainError(
                        f"{row.kind}/{row.external_id}: не найдено {field}={external_id}",
                        status_code=422,
                        code="unresolved_reference",
                    )
                values[target] = reference_id
            if await self.repository.natural_conflict(row.kind, values):
                raise DomainError(
                    "Дублирование учётного факта или пересечение прогнозов одного объекта",
                    status_code=409,
                    code="duplicate_accounting_fact",
                )
            await self.repository.write(row.kind, existing, values)
            summary["created" if existing is None else "updated"] += 1
        return await self.repository.finish_exchange(
            source, command, user_id, payload_hash, summary
        )
