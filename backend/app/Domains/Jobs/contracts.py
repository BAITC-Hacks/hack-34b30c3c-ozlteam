from dataclasses import dataclass, field
from typing import Literal, Protocol
from uuid import UUID

from pydantic import JsonValue

JobStatus = Literal["queued", "running", "done", "failed"]
StepState = Literal["pending", "done"]

# A job in one of these statuses never changes again, so status streams can close.
FINAL_STATUSES: tuple[JobStatus, ...] = ("done", "failed")

# One JSONB element of Job.steps.
JobStep = dict[str, str]
# Task keyword arguments handed to arq; must survive serialization.
JobPayload = dict[str, JsonValue]
JobResult = dict[str, JsonValue]

PARSE_DOCUMENT = "parse_document"
CALCULATE_REPLENISHMENT = "calculate_replenishment"

# Visible progress of every job kind. The order is the order the worker completes them in,
# and the arq task is registered under the same name as the kind.
JOB_STEPS: dict[str, tuple[str, ...]] = {
    "parse_import_package": (
        "Читаю исходные книги",
        "Сопоставляю и проверяю данные",
        "Сохраняю проверенный пакет",
    ),
    "apply_import_package": ("Применяю проверенные порции", "Завершаю источник данных"),
    PARSE_DOCUMENT: ("Читаю документ", "Спрашиваю модель", "Собираю ответ"),
    CALCULATE_REPLENISHMENT: (
        "Фиксирую данные",
        "Рассчитываю потребность",
        "Сохраняю рекомендации",
    ),
}


class JobsError(Exception):
    """Base error of the Jobs domain."""


class JobNotFound(JobsError):
    pass


class UnknownJobKind(JobsError):
    pass


class UnknownJobStep(JobsError):
    pass


class QueueUnavailable(JobsError):
    """Redis is not configured or not reachable, so nothing can be queued."""


class DocumentsUnavailable(JobsError):
    """The Files domain cannot provide the document a job was asked to work on."""


class JobQueue(Protocol):
    async def enqueue(self, kind: str, job_id: UUID, payload: JobPayload) -> None: ...


@dataclass(frozen=True, slots=True)
class Document:
    """What a job needs from an uploaded file, independent of how Files stores it."""

    name: str
    text: str
    images: list[bytes] = field(default_factory=list)


class DocumentSource(Protocol):
    async def read(self, file_id: UUID) -> Document: ...
