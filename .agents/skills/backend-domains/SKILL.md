---
name: backend-domains
description: Implement FastAPI endpoints and business operations in this project's modular Domains architecture, including SQLAlchemy repositories and Alembic migrations.
---

Use `backend/app/Domains/Notes` as the executable example. Keep the exact case of `Domains` and `DTO` for Linux compatibility.

Each business domain owns `controllers`, `services`, `repositories`, `models`, `DTO`, `resources` and its dependency wiring. Create additional folders only when used. A domain is a cohesive business capability, not necessarily one database table.

- Controllers parse HTTP input, invoke a service, return resources. No SQL or business rules.
- `DTO` contains validated input/commands; `resources` contains explicit output schemas. Do not leak internal ORM fields through unbounded responses.
- Services orchestrate use cases and enforce business rules. Use repository protocols; no FastAPI dependencies or HTTP exceptions in services. Translate domain exceptions at the HTTP boundary.
- Repositories own SQLAlchemy 2 async queries, flush, pagination and eager loading. They do not commit.
- `get_session` owns the request transaction and rolls back failures. Keep its dependency `scope="function"` so commit errors happen before the response is sent. For jobs/bot use cases, open an explicit transaction around the operation.
- This is pragmatic modular DDD: ORM models may serve simple domains. Introduce independent domain objects, value objects or a unit of work when business complexity justifies them; do not duplicate every model by default.
- Avoid cross-domain repository/model imports in business services. Expose services/contracts for cross-domain collaboration. `core` is infrastructure, not a dumping ground for domain rules.
- Register models in `migrations/env.py`, generate and inspect a migration, then run upgrade and `alembic check`. Never edit applied migrations for new schema changes.
- Vector columns use `pgvector.sqlalchemy.Vector(dimensions)`. Decide embedding model, dimension and metric before adding a schema. Use a migration for vector indexes. Do not invent embeddings or cache private retrieval responses in the PWA.

Run `docker compose exec api ruff check .`, `docker compose exec api ruff format --check .` and `docker compose exec api pytest`. For persistence changes also run the opt-in integration test in README; it inserts and removes its own records.
