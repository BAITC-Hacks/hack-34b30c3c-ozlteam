.PHONY: dev dev-bot dev-down dev-logs dev-ps seed mock mock-reset worker-logs test lint

dev:
	./scripts/dev.sh up --build -d

dev-bot:
	./scripts/dev.sh --profile bot up --build -d

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
