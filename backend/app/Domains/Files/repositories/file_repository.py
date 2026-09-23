from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Files.models.file import File


class FileRepository(Protocol):
    async def add(self, file: File) -> File: ...

    async def get(self, file_id: UUID) -> File | None: ...

    async def delete(self, file: File) -> None: ...


class SqlAlchemyFileRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, file: File) -> File:
        self.session.add(file)
        await self.session.flush()
        await self.session.refresh(file)
        return file

    async def get(self, file_id: UUID) -> File | None:
        return await self.session.get(File, file_id)

    async def delete(self, file: File) -> None:
        await self.session.delete(file)
        await self.session.flush()
