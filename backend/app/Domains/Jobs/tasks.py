from asyncio import sleep
from time import monotonic
from uuid import UUID

import structlog

from app.Domains.Ai.dependencies import get_llm_provider
from app.Domains.Jobs.contracts import (
    JOB_STEPS,
    PARSE_DOCUMENT,
    Document,
    DocumentsUnavailable,
    JobNotFound,
)
from app.Domains.Jobs.dependencies import open_document_source, open_job_service

logger = structlog.get_logger(__name__)

SYSTEM_PROMPT = (
    "Ты ассистент строительной компании. Отвечай по-русски, только по содержимому документа. "
    "Если в документе нет ответа, так и скажи вместо догадки."
)
# The job row is committed by the request that queued it, which can land just after the
# worker picks the task up. Wait for it instead of failing the whole job on a race.
VISIBILITY_TIMEOUT = 10.0
VISIBILITY_INTERVAL = 0.2


async def parse_document(ctx: dict[str, object], job_id: str, file_id: str, prompt: str) -> None:
    """Read an uploaded document and answer a question about it, step by step."""
    identifier = UUID(job_id)
    read, ask, _ = JOB_STEPS[PARSE_DOCUMENT]
    started = monotonic()
    try:
        await _start(identifier)

        async with open_document_source() as documents:
            document = await documents.read(UUID(file_id))
        if not document.text and not document.images:
            raise DocumentsUnavailable(f"File {file_id} has no readable content")
        async with open_job_service() as jobs:
            await jobs.complete_step(identifier, read)

        answer = await get_llm_provider().complete(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _question(prompt, document)}],
            images=document.images or None,
        )
        async with open_job_service() as jobs:
            await jobs.complete_step(identifier, ask)
            # finish() marks the remaining steps done, including the last one.
            await jobs.finish(identifier, {"document": document.name, "answer": answer})

        logger.info(
            "job.done",
            job=job_id,
            kind=PARSE_DOCUMENT,
            duration_ms=round((monotonic() - started) * 1000),
        )
    except Exception as error:
        logger.exception("job.failed", job=job_id, kind=PARSE_DOCUMENT, error=str(error))
        await _fail(identifier, f"{type(error).__name__}: {error}")


def _question(prompt: str, document: Document) -> str:
    if not document.text:
        return f"Документ: {document.name}\n\nВопрос: {prompt}"
    return f"Документ: {document.name}\n\n{document.text}\n\nВопрос: {prompt}"


async def _start(job_id: UUID) -> None:
    deadline = monotonic() + VISIBILITY_TIMEOUT
    while True:
        try:
            async with open_job_service() as jobs:
                await jobs.start(job_id)
            return
        except JobNotFound:
            if monotonic() >= deadline:
                raise
            await sleep(VISIBILITY_INTERVAL)


async def _fail(job_id: UUID, error: str) -> None:
    try:
        async with open_job_service() as jobs:
            await jobs.fail(job_id, error)
    except Exception:
        # The job is already failing; a second failure must not hide the first one.
        logger.exception("job.failed_unrecorded", job=str(job_id))
