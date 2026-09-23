"""Единый список моделей: SQLAlchemy резолвит внешние ключи только по загруженным таблицам.

Каждая точка входа (API, воркер, миграции, сиды) импортирует этот модуль. Без него
междоменный FK — например `jobs.created_by` на `users.id` — падает с NoReferencedTableError.
"""

from app.Domains.Ai.models.conversation import AgentMessage, AgentProposal, Conversation
from app.Domains.Catalogs.models import Category, Product, Supplier, Warehouse
from app.Domains.DataImports.models import ImportBatch
from app.Domains.DataImports.models.packages import (
    ImportIdentity,
    ImportPackage,
    ImportPackageChunk,
    ImportPackageEvidence,
)
from app.Domains.Files.models.file import File
from app.Domains.Integrations1C.models import ExchangeBatch, IntegrationSource, RestReport
from app.Domains.Inventory.models import (
    GrowthForecast,
    InboundShipment,
    InventorySnapshot,
    Sale,
    StockoutInterval,
)
from app.Domains.Jobs.models.job import Job
from app.Domains.Notes.models.note import Note
from app.Domains.Procurement.models import (
    Order,
    OrderAllocation,
    OrderAudit,
    OrderCreation,
    OrderDelivery,
    OrderLine,
)
from app.Domains.Replenishment.models.calculation import CalculationRun, Recommendation
from app.Domains.Security.models.session import AuthSession
from app.Domains.Users.models import Permission, Role, User

__all__ = [
    "AgentMessage",
    "AgentProposal",
    "Conversation",
    "AuthSession",
    "File",
    "Job",
    "Note",
    "Permission",
    "Role",
    "User",
    "Category",
    "Product",
    "Supplier",
    "Warehouse",
    "ImportBatch",
    "ImportIdentity",
    "ImportPackage",
    "ImportPackageChunk",
    "ImportPackageEvidence",
    "ExchangeBatch",
    "IntegrationSource",
    "RestReport",
    "GrowthForecast",
    "InboundShipment",
    "InventorySnapshot",
    "Sale",
    "StockoutInterval",
    "Order",
    "OrderAllocation",
    "OrderAudit",
    "OrderCreation",
    "OrderDelivery",
    "OrderLine",
    "CalculationRun",
    "Recommendation",
]
