import json
from collections import defaultdict
from uuid import UUID

from sqlalchemy import delete, func, select, text, tuple_
from sqlalchemy.dialects.postgresql import insert

from app.core.errors import DomainError
from app.Domains.DataImports.DTO.rows import json_value
from app.Domains.DataImports.models.packages import (
    ImportIdentity,
    ImportPackage,
    ImportPackageChunk,
    ImportPackageEvidence,
)
from app.Domains.DataImports.repositories.data_repository import MODELS, REFERENCES, DataRepository
from app.Domains.DataImports.services.exchange_service import check_revision, digest
from app.Domains.DataImports.services.package_rules import validate_profile_manifest
from app.Domains.Integrations1C.models import IntegrationSource

CHUNK_SIZE = 1000


class PackageRepository:
    def __init__(self, session):
        self.session = session

    async def lock_fingerprint(self, fingerprint):
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"import-package:{fingerprint}"},
        )

    async def by_fingerprint(self, fingerprint):
        return await self.session.scalar(
            select(ImportPackage).where(ImportPackage.fingerprint == fingerprint)
        )

    async def get(self, identifier, lock=False):
        query = select(ImportPackage).where(ImportPackage.id == identifier)
        if lock:
            query = query.with_for_update()
        return await self.session.scalar(query)

    async def add(self, **values):
        item = ImportPackage(**values)
        self.session.add(item)
        await self.session.flush()
        return item

    async def list(self, limit, offset):
        total = await self.session.scalar(select(func.count()).select_from(ImportPackage))
        rows = await self.session.scalars(
            select(ImportPackage)
            .order_by(ImportPackage.created_at.desc(), ImportPackage.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows), total or 0

    async def entries(self, identifier, field):
        return await self.session.scalar(
            select(getattr(ImportPackage, field)).where(ImportPackage.id == identifier)
        )

    async def active_for_source(self, source_id, exclude_id):
        return await self.session.scalar(
            select(ImportPackage.id)
            .where(
                ImportPackage.source_id == source_id,
                ImportPackage.id != exclude_id,
                ImportPackage.status.in_(("applying", "failed")),
                ImportPackage.expected_revision.is_not(None),
            )
            .limit(1)
        )

    async def replace_chunks(self, package_id, rows):
        await self.session.execute(
            delete(ImportPackageChunk).where(ImportPackageChunk.package_id == package_id)
        )
        for position, start in enumerate(range(0, len(rows), CHUNK_SIZE)):
            self.session.add(
                ImportPackageChunk(
                    package_id=package_id,
                    position=position,
                    rows=rows[start : start + CHUNK_SIZE],
                    applied=False,
                )
            )
        await self.session.flush()

    async def replace_evidence(self, package_id, rows):
        await self.session.execute(
            delete(ImportPackageEvidence).where(ImportPackageEvidence.package_id == package_id)
        )
        for position, start in enumerate(range(0, len(rows), CHUNK_SIZE)):
            self.session.add(
                ImportPackageEvidence(
                    package_id=package_id,
                    position=position,
                    rows=json.loads(
                        json.dumps(rows[start : start + CHUNK_SIZE], default=json_value)
                    ),
                )
            )
            if position % 20 == 0:
                await self.session.flush()
        await self.session.flush()

    async def next_chunk(self, package_id):
        return await self.session.scalar(
            select(ImportPackageChunk)
            .where(
                ImportPackageChunk.package_id == package_id, ImportPackageChunk.applied.is_(False)
            )
            .order_by(ImportPackageChunk.position)
            .limit(1)
            .with_for_update()
        )

    async def bulk_exchange(self, source, command, user_id):
        """Same revision/idempotency rules as normalized exchange, with bounded bulk SQL."""
        data = DataRepository(self.session)
        payload_hash = digest(command.model_dump(mode="json"))
        previous = await data.batch(source.id, command.batch_key)
        if previous is not None:
            if previous.payload_hash != payload_hash:
                raise DomainError("Ключ пакета содержит другие данные", 409, "batch_conflict")
            return previous
        if source.revision != command.expected_revision:
            raise DomainError("Источник изменился после проверки пакета", 409, "source_conflict")
        grouped = defaultdict(list)
        for row in command.rows:
            grouped[row.kind].append(row)
        summary = {"created": 0, "updated": 0, "unchanged": 0}
        for kind in MODELS:  # dependency order: catalogs, then facts
            rows = grouped[kind]
            if not rows:
                continue
            model = MODELS[kind]
            identities = [row.external_id for row in rows]
            if len(set(identities)) != len(identities):
                raise DomainError("Повтор идентификатора в пакете", 422, "duplicate_source_row")
            existing = {
                row.external_id: row
                for row in await self.session.scalars(
                    select(model).where(
                        model.source_id == source.id, model.external_id.in_(identities)
                    )
                )
            }
            references = {}
            for field, (target_model, _) in REFERENCES.items():
                values = {getattr(row, field, None) for row in rows} - {None}
                if values:
                    references[field] = dict(
                        (
                            await self.session.execute(
                                select(target_model.external_id, target_model.id).where(
                                    target_model.source_id == source.id,
                                    target_model.external_id.in_(values),
                                )
                            )
                        ).all()
                    )
            writes = []
            for row in rows:
                row_hash = digest(row.model_dump(mode="json"))
                old = existing.get(row.external_id)
                if old is not None and not check_revision(
                    old.source_revision, old.payload_hash, row.revision, row_hash
                ):
                    summary["unchanged"] += 1
                    continue
                values = row.model_dump(exclude={"kind", "revision"})
                values.update(
                    source_id=source.id, source_revision=row.revision, payload_hash=row_hash
                )
                for field, (_, target) in REFERENCES.items():
                    if field not in values:
                        continue
                    external = values.pop(field)
                    identifier = references.get(field, {}).get(external)
                    if external is not None and identifier is None:
                        raise DomainError(
                            "Не найдено сопоставление справочника", 422, "unresolved_reference"
                        )
                    values[target] = identifier
                writes.append(values)
                summary["updated" if old else "created"] += 1
            if not writes:
                continue
            await self._natural_conflicts(kind, source.id, writes)
            statement = insert(model).values(writes)
            excluded = {"id", "source_id", "external_id", "created_at"}
            await self.session.execute(
                statement.on_conflict_do_update(
                    index_elements=["source_id", "external_id"],
                    set_={
                        name: getattr(statement.excluded, name)
                        for name in writes[0]
                        if name not in excluded
                    }
                    | {"updated_at": func.now()},
                )
            )
            if kind == "products":
                await self._product_identities(source.id, writes)
        return await data.finish_exchange(source, command, user_id, payload_hash, summary)

    async def _natural_conflicts(self, kind, source_id, rows):
        keys = {
            "sales": ("warehouse_id", "document_id", "line_id"),
            "stocks": ("warehouse_id", "product_id", "as_of"),
        }.get(kind)
        if keys is None:
            return
        identities = {}
        for row in rows:
            key = tuple(row[field] for field in keys)
            if key in identities and identities[key] != row["external_id"]:
                raise DomainError("Повтор учётного факта", 409, "duplicate_accounting_fact")
            identities[key] = row["external_id"]
        model = MODELS[kind]
        existing = await self.session.execute(
            select(model.external_id, *(getattr(model, key) for key in keys)).where(
                model.source_id == source_id,
                tuple_(*(getattr(model, key) for key in keys)).in_(identities),
            )
        )
        if any(identities[tuple(row[1:])] != row[0] for row in existing):
            raise DomainError(
                "Пересекающаяся выгрузка дублирует факт", 409, "duplicate_accounting_fact"
            )

    async def _product_identities(self, source_id: UUID, rows):
        model = MODELS["products"]
        products = await self.session.scalars(
            select(model)
            .where(
                model.source_id == source_id,
                model.external_id.in_([row["external_id"] for row in rows]),
            )
            .execution_options(populate_existing=True)
        )
        entries = [
            {
                "source_id": source_id,
                "kind": "products",
                "code": p.code,
                "characteristic": p.characteristic_external_id or "",
                "external_id": p.external_id,
                "product_id": p.id,
            }
            for p in products
            if p.code is not None
        ]
        if entries:
            statement = insert(ImportIdentity).values(entries)
            # Re-import keeps the same mapping. Never silently rebind an existing code.
            conflicts = await self.session.execute(
                select(
                    ImportIdentity.code, ImportIdentity.characteristic, ImportIdentity.external_id
                ).where(
                    ImportIdentity.source_id == source_id,
                    ImportIdentity.kind == "products",
                    ImportIdentity.code.in_([entry["code"] for entry in entries]),
                )
            )
            known = {(row[0], row[1]): row[2] for row in conflicts}
            if any(
                known.get((entry["code"], entry["characteristic"]), entry["external_id"])
                != entry["external_id"]
                for entry in entries
            ):
                raise DomainError("Код уже сопоставлен другому товару", 409, "identity_conflict")
            await self.session.execute(
                statement.on_conflict_do_nothing(
                    index_elements=["source_id", "kind", "code", "characteristic"]
                )
            )

    async def source(self, source_id, lock=False):
        return await DataRepository(self.session).source(source_id, lock)

    async def create_source(self, name):
        await self.lock_fingerprint("default-source:" + name)
        existing = await self.session.scalar(
            select(IntegrationSource)
            .where(
                IntegrationSource.system == "file",
                IntegrationSource.name == name,
            )
            .order_by(IntegrationSource.id)
            .limit(1)
        )
        return existing or await DataRepository(self.session).create_source(
            name=name, system="file"
        )

    async def guard_fact_replacement(self, package):
        validate_profile_manifest(package.files)
        incoming = {
            f.get("profile"): f["sha256"]
            for f in package.files
            if str(f.get("profile", "")).endswith((".dynamics", ".inbound"))
        }
        previous = await self.session.execute(
            select(ImportPackage.files, ImportPackage.options).where(
                ImportPackage.source_id == package.source_id,
                ImportPackage.id != package.id,
                ImportPackage.status == "applied",
            )
        )
        fact_options = (
            "warehouse_mapping",
            "negative_sales_policy",
            "history_start",
            "as_of",
            "purchase_conversions",
            "unit_overrides",
            "stock_overrides",
        )
        for files, options in previous:
            validate_profile_manifest(files)
            if any(options.get(key) != package.options.get(key) for key in fact_options):
                raise DomainError(
                    "Изменение настроек учётных фактов требует замены или переноса прежних данных. "
                    "Для этого используйте отдельный тестовый источник или нормализованный обмен. "
                    "Безопасно менять срок поставки, смысл MOQ и revision при прежних фактах.",
                    409,
                    "fact_options_replacement_unsupported",
                )
            for file in files:
                profile = file.get("profile")
                if profile in incoming and incoming[profile] != file["sha256"]:
                    raise DomainError(
                        "Динамика или путь этого источника импортированы из другой версии книги. "
                        "Без стабильного ID строки 1С замена может удвоить учётные факты. "
                        "Используйте отдельный тестовый источник или согласованный обмен 1С.",
                        409,
                        "workbook_replacement_unsupported",
                    )

    async def flush(self):
        await self.session.flush()
