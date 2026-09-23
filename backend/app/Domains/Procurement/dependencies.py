from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.Domains.Procurement.adapters.source import OrderSource
from app.Domains.Procurement.repositories.order_repository import OrderRepository
from app.Domains.Procurement.services.order_service import OrderService


def get_order_service(
    session: Annotated[AsyncSession, Depends(get_session, scope="function")],
) -> OrderService:
    return OrderService(OrderRepository(session), OrderSource(session))
