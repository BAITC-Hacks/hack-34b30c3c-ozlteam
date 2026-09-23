from typing import Protocol
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.Domains.Files.models.file import File


class FileRepository(Protocol):
    async def add(self, file: File) -> File: ...

    async def get(self, file_id: UUID) -> File | None: ...

    async def list_recent(self, limit: int, offset: int) -> list[File]: ...

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

    async def list_recent(self, limit: int, offset: int) -> list[File]:
        result = await self.session.scalars(
            select(File)
            .order_by(File.created_at.desc(), File.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result)

    async def delete(self, file: File) -> None:
        await self.session.delete(file)
        await self.session.flush()
