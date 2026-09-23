from app.core.errors import DomainError
from app.Domains.Integrations1C.resources.exchange import ExchangeResource, SourceResource


class IntegrationService:
    def __init__(self, repository, exchange_service):
        self.repository = repository
        self.exchange_service = exchange_service

    async def sources(self):
        return [SourceResource.model_validate(s) for s in await self.repository.sources()]

    async def create(self, command):
        return SourceResource.model_validate(
            await self.repository.create_source(**command.model_dump())
        )

    async def exchange(self, source_id, command, user_id):
        return ExchangeResource.model_validate(
            await self.exchange_service.apply(source_id, command, user_id)
        )

    async def logs(self, source_id, limit, offset):
        if await self.repository.source(source_id) is None:
            raise DomainError("Источник не найден", status_code=404, code="source_not_found")
        return [
            ExchangeResource.model_validate(b)
            for b in await self.repository.exchanges(source_id, limit, offset)
        ]
