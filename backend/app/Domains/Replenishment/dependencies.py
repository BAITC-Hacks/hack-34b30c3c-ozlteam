from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.Domains.Jobs.dependencies import get_job_service
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Replenishment.repositories.calculation_repository import (
    SqlAlchemyCalculationRepository,
)
from app.Domains.Replenishment.services.replenishment_service import ReplenishmentService


def get_replenishment_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
    jobs: Annotated[JobService, Depends(get_job_service)],
) -> ReplenishmentService:
    return ReplenishmentService(SqlAlchemyCalculationRepository(session), jobs)
