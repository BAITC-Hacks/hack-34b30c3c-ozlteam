from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session, session_factory
from app.Domains.Files.dependencies import (
    get_file_service,
    get_file_storage,
    get_image_validator,
    get_preview_renderer,
)
from app.Domains.Jobs.adapters.arq_queue import ArqJobQueue
from app.Domains.Jobs.adapters.files_documents import FilesDocumentSource
from app.Domains.Jobs.contracts import DocumentSource, JobQueue
from app.Domains.Jobs.repositories.job_repository import SqlAlchemyJobRepository
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Jobs.services.job_stream import JobStream


@lru_cache
def get_job_queue() -> JobQueue:
    # One Redis pool per process; the connection itself is opened on the first enqueue.
    return ArqJobQueue(get_settings().redis_url)


def get_job_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
) -> JobService:
    return JobService(SqlAlchemyJobRepository(session), get_job_queue())


def get_job_stream() -> JobStream:
    return JobStream(open_job_service)


@asynccontextmanager
async def open_job_service() -> AsyncIterator[JobService]:
    """Job service outside a request: the worker and the status stream own their transaction."""
    async with session_factory() as session, session.begin():
        yield JobService(SqlAlchemyJobRepository(session), get_job_queue())


@asynccontextmanager
async def open_document_source() -> AsyncIterator[DocumentSource]:
    """Read access to uploaded files for the worker, through the Files domain service."""
    async with session_factory() as session, session.begin():
        yield FilesDocumentSource(
            get_file_service(
                session, get_file_storage(), get_preview_renderer(), get_image_validator()
            )
        )
