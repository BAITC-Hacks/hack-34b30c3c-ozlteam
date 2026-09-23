"""Idempotent synthetic purchasing demo; never reads or replaces partner workbooks.

Run after migrations and regular seed: python -m app.seed.replenishment
"""

import json
from datetime import date, timedelta

from sqlalchemy import select, text

import app.models  # noqa: F401
from app.Domains.Catalogs.models import Warehouse
from app.Domains.DataImports.repositories.data_repository import DataRepository
from app.Domains.DataImports.services.exchange_service import ExchangeService
from app.Domains.Integrations1C.DTO.exchange import ExchangeCommand
from app.Domains.Integrations1C.models import IntegrationSource
from app.Domains.Jobs.dependencies import get_job_queue
from app.Domains.Jobs.repositories.job_repository import SqlAlchemyJobRepository
from app.Domains.Jobs.services.job_service import JobService
from app.Domains.Replenishment.DTO.calculation import CreateCalculation
from app.Domains.Replenishment.repositories.calculation_repository import (
    SqlAlchemyCalculationRepository,
)
from app.Domains.Replenishment.services.replenishment_service import ReplenishmentService
from app.Domains.Users.models.user import User
from app.seed.runner import run, session_scope
from app.seed.seed import resolve_admin_email

AS_OF = date(2026, 9, 22)
DEMO_NAME = "ДЕМО: Электрокомплект, синтетические данные 2026-09-22"


def demo_rows():
    rows = [
        {
            "kind": "categories",
            "external_id": "electrical",
            "revision": 1,
            "name": "Электрика (демо)",
            "review_days": 14,
            "safety_days": 7,
        },
        {
            "kind": "warehouses",
            "external_id": "warehouse-demo",
            "revision": 1,
            "name": "Алматы (демо)",
            "organization_external_id": "demo-organization",
        },
    ]
    for supplier in ("a", "b"):
        rows.append(
            {
                "kind": "suppliers",
                "external_id": f"supplier-{supplier}",
                "revision": 1,
                "name": f"Поставщик {supplier.upper()} (демо)",
            }
        )
    for index, name in enumerate(
        ("Сезонный товар", "Растущий спрос", "Stockout", "Разовая продажа")
    ):
        key = f"product-{index}"
        rows.append(
            {
                "kind": "products",
                "external_id": key,
                "revision": 1,
                "sku": f"DEMO-00{index}",
                "code": f"000{index}_",
                "name": name,
                "unit": "шт",
                "category_external_id": "electrical",
                "supplier_external_id": f"supplier-{'a' if index < 2 else 'b'}",
                "lead_time_days": 14,
                "pack_size": "5",
                "min_order_qty": "10",
            }
        )
        for offset in range(730):
            current = AS_OF - timedelta(days=offset)
            if index == 2 and 8 <= offset <= 20:
                continue
            quantity = 20 if current.month in (9, 10, 11) else 8
            if index == 1:
                quantity += (730 - offset) // 90
            rows.append(
                {
                    "kind": "sales",
                    "external_id": f"{key}-{current}",
                    "revision": 1,
                    "product_external_id": key,
                    "warehouse_external_id": "warehouse-demo",
                    "date": str(current),
                    "document_id": f"{key}-{current}",
                    "line_id": "1",
                    "quantity": str(quantity),
                    "client_id": "demo-regular-customer",
                }
            )
        rows.append(
            {
                "kind": "stocks",
                "external_id": f"stock-{key}",
                "revision": 1,
                "product_external_id": key,
                "warehouse_external_id": "warehouse-demo",
                "as_of": f"{AS_OF}T18:00:00+05:00",
                "quantity": "30",
                "reserved": "5",
            }
        )
    rows.extend(
        [
            {
                "kind": "sales",
                "external_id": "one-off",
                "revision": 1,
                "product_external_id": "product-3",
                "warehouse_external_id": "warehouse-demo",
                "date": str(AS_OF - timedelta(days=5)),
                "document_id": "one-off",
                "line_id": "1",
                "quantity": "5000",
                "client_id": "demo-one-off-customer",
            },
            {
                "kind": "stockouts",
                "external_id": "stockout",
                "revision": 1,
                "product_external_id": "product-2",
                "warehouse_external_id": "warehouse-demo",
                "start": str(AS_OF - timedelta(days=20)),
                "end": str(AS_OF - timedelta(days=8)),
            },
            {
                "kind": "inbound",
                "external_id": "arrival",
                "revision": 1,
                "product_external_id": "product-0",
                "warehouse_external_id": "warehouse-demo",
                "supplier_external_id": "supplier-a",
                "document_id": "demo-inbound",
                "expected_date": str(AS_OF + timedelta(days=5)),
                "quantity": "100",
                "status": "in_transit",
            },
            {
                "kind": "growth",
                "external_id": "growth",
                "revision": 1,
                "product_external_id": "product-1",
                "start": str(AS_OF + timedelta(days=1)),
                "end": str(AS_OF + timedelta(days=90)),
                "rate": "0.1",
                "mode": "additional",
            },
        ]
    )
    return rows


async def main():
    async with session_scope() as session:
        await session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": DEMO_NAME}
        )
        actor = await session.scalar(select(User).where(User.email == resolve_admin_email()))
        if actor is None:
            raise RuntimeError("Сначала выполните python -m app.seed.seed")
        source = await session.scalar(
            select(IntegrationSource).where(IntegrationSource.name == DEMO_NAME)
        )
        repository = DataRepository(session)
        if source is None:
            source = await repository.create_source(name=DEMO_NAME, system="file")
        await ExchangeService(repository).apply(
            source.id,
            ExchangeCommand(
                batch_key="synthetic-v1",
                expected_revision=0,
                cursor="synthetic-v1",
                complete=True,
                rows=demo_rows(),
            ),
            actor.id,
        )
        warehouse = await session.scalar(
            select(Warehouse).where(
                Warehouse.source_id == source.id, Warehouse.external_id == "warehouse-demo"
            )
        )
        service = ReplenishmentService(
            SqlAlchemyCalculationRepository(session),
            JobService(SqlAlchemyJobRepository(session), get_job_queue()),
        )
        calculation = await service.create(
            CreateCalculation(
                warehouse_id=warehouse.id,
                as_of=AS_OF,
                idempotency_key="synthetic-replenishment-v1",
            ),
            actor.id,
        )
        result = {
            "source_id": str(source.id),
            "warehouse_id": str(warehouse.id),
            "run_id": str(calculation.id),
            "job_id": str(calculation.job_id),
            "status": calculation.status,
            "as_of": str(AS_OF),
        }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    run(main())
