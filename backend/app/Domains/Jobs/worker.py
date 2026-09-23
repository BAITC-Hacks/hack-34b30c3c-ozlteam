from arq.connections import RedisSettings

import app.models  # noqa: F401 - регистрирует таблицы для междоменных внешних ключей
from app.core.config import get_settings
from app.core.database import engine
from app.Domains.Jobs.tasks import parse_document


async def close_database(ctx: dict[str, object]) -> None:
    await engine.dispose()


# Compose runs `arq app.Domains.Jobs.worker.WorkerSettings`; the path is part of the contract.
class WorkerSettings:
    functions = [parse_document]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    on_shutdown = close_database
    # Document parsing takes seconds to a minute, so keep the timeout generous and the
    # concurrency low enough for the model provider.
    max_jobs = 4
    job_timeout = 600
    keep_result = 3600
    # The job row already carries status and error; arq retries would fight with it.
    max_tries = 1
