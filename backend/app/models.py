"""Единый список моделей: SQLAlchemy резолвит внешние ключи только по загруженным таблицам.

Каждая точка входа (API, воркер, миграции, сиды) импортирует этот модуль. Без него
междоменный FK — например `jobs.created_by` на `users.id` — падает с NoReferencedTableError.
"""

from app.Domains.Files.models.file import File
from app.Domains.Jobs.models.job import Job
from app.Domains.Notes.models.note import Note
from app.Domains.Security.models.session import AuthSession
from app.Domains.Users.models import Permission, Role, User

__all__ = ["AuthSession", "File", "Job", "Note", "Permission", "Role", "User"]
