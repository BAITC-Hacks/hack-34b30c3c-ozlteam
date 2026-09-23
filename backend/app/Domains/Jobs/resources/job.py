from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue

from app.Domains.Jobs.contracts import JobStatus, StepState


class JobStepResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    state: StepState


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    status: JobStatus
    steps: list[JobStepResource]
    result: dict[str, JsonValue] | None
    error: str | None
