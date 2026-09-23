"""Reproduce the checked-in EKT Excel test package through the normal import worker.

Run after migrations and the base seed, with the worker running:
``python -m app.seed.partner_workbooks --directory /seed-input``.
No data is invented, reset, or copied from a developer's database.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from pathlib import Path
from time import monotonic

import app.models  # noqa: F401
from app.Domains.DataImports.DTO.packages import PackageOptions
from app.Domains.DataImports.repositories.package_repository import PackageRepository
from app.Domains.DataImports.services.package_service import DEFAULT_SOURCE_NAME, PackageService
from app.Domains.Files.dependencies import get_file_storage
from app.Domains.Jobs.dependencies import get_job_service
from app.seed.runner import done, run, session_scope
from app.seed.seed import find_user, resolve_admin_email

MANIFEST = Path(__file__).with_name("data") / "partner_workbooks.json"


def load_seed_files(directory: Path, manifest_path: Path = MANIFEST):
    """Verify every pinned input before creating a source, job, or package."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["version"] != 1 or manifest["source_name"] != DEFAULT_SOURCE_NAME:
        raise ValueError("Неизвестная версия или источник Excel-сида")
    options = PackageOptions.model_validate(manifest["options"])
    root = directory.resolve()
    files = []
    names = set()
    for item in manifest["files"]:
        path = (root / item["path"]).resolve()
        if not path.is_relative_to(root) or path.suffix.lower() != ".xlsx":
            raise ValueError("Недопустимый путь в манифесте Excel-сида")
        if path.name in names:
            raise ValueError("Повтор имени книги в манифесте Excel-сида")
        names.add(path.name)
        if not path.is_file():
            raise ValueError(f"Не найдена книга: {item['path']}")
        content = path.read_bytes()
        if len(content) != item["size"] or hashlib.sha256(content).hexdigest() != item["sha256"]:
            raise ValueError(f"Книга отличается от закреплённой версии: {item['path']}")
        files.append((path.name, content))
    if not files:
        raise ValueError("В манифесте нет книг")
    return manifest, files, options


@asynccontextmanager
async def package_service():
    async with session_scope() as session:
        yield PackageService(
            PackageRepository(session), get_file_storage(), get_job_service(session)
        )


def verify_counts(package, expected):
    counts = package.summary.get("by_kind", {})
    mismatches = [
        f"{kind}: {counts.get(kind, 0)} вместо {count}"
        for kind, count in expected.items()
        if kind != "rows" and counts.get(kind, 0) != count
    ]
    if package.row_count != expected["rows"]:
        mismatches.append(f"строки: {package.row_count} вместо {expected['rows']}")
    if package.status == "applied" and package.processed_rows != expected["rows"]:
        mismatches.append("не все строки применены")
    if mismatches:
        raise RuntimeError(
            "Число строк отличается от манифеста: " + "; ".join(mismatches) + ". "
            "Проверьте изменения адаптера; новое применение не запускается."
        )


async def seed_package(
    manifest,
    files,
    options,
    user_id,
    *,
    timeout=1800,
    retry_failed=False,
    poll_interval=2,
    service_scope=package_service,
    progress=print,
):
    """Reuse the UI package identity and wait for its durable, resumable worker jobs."""
    async with service_scope() as service:
        package = await service.stage(files, options, None, manifest["name"], user_id)
    # An explicitly requested retry is only for a failure that existed when we started.
    # A fresh worker error must surface instead of becoming an unbounded retry loop.
    if package.status == "failed" and retry_failed:
        async with service_scope() as service:
            package = await service.retry(package.id, user_id)
    deadline = monotonic() + timeout
    last_progress = None
    while True:
        state = (package.status, package.processed_rows, package.row_count)
        if state != last_progress:
            total = package.row_count
            amount = f", строк {package.processed_rows:,}/{total:,}" if total else ""
            progress(f"Пакет {package.id}: {package.status}{amount}", flush=True)
            last_progress = state
        if package.status == "applied":
            verify_counts(package, manifest["expected"])
            return package
        if package.status == "failed":
            raise RuntimeError(
                f"Импорт завершился ошибкой: {package.error}. "
                "После устранения причины повторите с --retry-failed."
            )
        if monotonic() >= deadline:
            raise TimeoutError(
                "Истекло время ожидания Excel-сида. Фоновая задача не отменена. "
                "Проверьте worker и повторите команду: существующий пакет будет использован."
            )
        if package.status == "validated":
            verify_counts(package, manifest["expected"])
            async with service_scope() as service:
                package = await service.apply(package.id, user_id)
            continue
        if package.status not in {"queued", "parsing", "applying"}:
            raise RuntimeError(f"Неизвестное состояние пакета: {package.status}")
        await asyncio.sleep(poll_interval)
        async with service_scope() as service:
            package = service.resource(await service.get(package.id))


async def main(args):
    manifest, files, options = load_seed_files(args.directory)
    print(f"Проверены {len(files)} закреплённых книг. Источник: {DEFAULT_SOURCE_NAME}", flush=True)
    async with session_scope() as session:
        user = await find_user(session, resolve_admin_email())
        if user is None or not any(role.code == "admin" for role in user.roles):
            raise RuntimeError("Сначала выполните базовый сид: python -m app.seed.seed")
        user_id = user.id
    package = await seed_package(
        manifest,
        files,
        options,
        user_id,
        timeout=args.timeout,
        retry_failed=args.retry_failed,
    )
    done(
        f"Excel-сид применён: {package.processed_rows:,} строк, источник {package.source_id}. "
        "Повторный запуск сохраняет существующие UUID и не дублирует продажи."
    )


def positive_timeout(value):
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("Время ожидания должно быть больше нуля")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True, help="Корень TrackLogic")
    parser.add_argument("--timeout", type=positive_timeout, default=1800, help="Ожидание, секунд")
    parser.add_argument("--retry-failed", action="store_true", help="Повторить ошибочный пакет")
    try:
        run(main(parser.parse_args()))
    except (ValueError, RuntimeError, TimeoutError) as error:
        parser.exit(1, f"Excel-сид: {error}\n")
