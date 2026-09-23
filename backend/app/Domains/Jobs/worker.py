from arq import cron
from arq.connections import RedisSettings

import app.models  # noqa: F401 - регистрирует таблицы для междоменных внешних ключей
from app.core.config import get_settings
from app.core.database import engine
from app.Domains.DataImports.tasks import apply_import_package, parse_import_package
from app.Domains.Jobs.dispatch import dispatch_pending
from app.Domains.Jobs.tasks import parse_document
from app.Domains.Replenishment.tasks import calculate_replenishment


async def close_database(ctx: dict[str, object]) -> None:
    await engine.dispose()


# Compose runs `arq app.Domains.Jobs.worker.WorkerSettings`; the path is part of the contract.
class WorkerSettings:
    functions = [
        parse_document,
        calculate_replenishment,
        parse_import_package,
        apply_import_package,
    ]
    cron_jobs = [cron(dispatch_pending, second={0, 10, 20, 30, 40, 50})]
    on_startup = dispatch_pending
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    on_shutdown = close_database
    # Document parsing takes seconds to a minute, so keep the timeout generous and the
    # concurrency low enough for the model provider.
    max_jobs = 4
    job_timeout = 600
    # PostgreSQL owns results; allow republishing after a killed worker or Redis loss.
    keep_result = 0
    max_tries = 5
