.PHONY: dev dev-build dev-env dev-env-bot dev-bot dev-down dev-logs dev-ps seed seed-excel mock mock-reset worker-logs test lint

# Повторный запуск использует готовые образы; код подключён через bind mounts.
dev:
	./scripts/dev.sh up -d

# Только после изменения Dockerfile или зависимостей Python.
dev-build:
	./scripts/dev.sh up --build -d

# Перечитать .env.local и пересоздать изменившиеся сервисы без сборки образов.
dev-env:
	./scripts/dev.sh up -d --no-build

dev-env-bot:
	./scripts/dev.sh --profile bot up -d --no-build

dev-bot:
	./scripts/dev.sh --profile bot up -d

dev-down:
	./scripts/dev.sh --profile bot down

dev-logs:
	./scripts/dev.sh logs -f

dev-ps:
	./scripts/dev.sh ps

worker-logs:
	./scripts/dev.sh logs -f worker

# Справочники: права, роли, администратор. Идемпотентно.
seed:
	./scripts/dev.sh exec api python -m app.seed.seed

# Тестовые Excel IEK и Systeme Electric через штатный импорт. Нужны seed и worker.
seed-excel:
	./scripts/seed-excel.sh

# Демонстрационные данные поверх справочников. Идемпотентно.
mock:
	./scripts/dev.sh exec api python -m app.seed.mock

mock-reset:
	./scripts/dev.sh exec api python -m app.seed.mock --reset

test:
	./scripts/dev.sh exec api pytest -q

lint:
	./scripts/dev.sh exec api ruff check app
	./scripts/dev.sh exec frontend npm run typecheck
