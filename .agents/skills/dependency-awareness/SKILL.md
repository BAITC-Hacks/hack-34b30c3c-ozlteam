---
name: dependency-awareness
description: Evaluate maintained libraries, established standards, and existing framework capabilities whenever implementation may otherwise reinvent non-trivial infrastructure. Use proactively for security-sensitive, protocol-based, integration-heavy, or broadly reusable functionality; skip ordinary product logic and trivial utilities.
---

# Dependency awareness

Before writing custom infrastructure, decide independently whether the requirement is better served by an existing project dependency, a built-in framework capability, an established standard, or a maintained third-party library. Do not wait for the user to request a library search.

## When to investigate

Investigate when the task involves security or authentication, cryptography, permissions, protocols, external integrations, parsing complex formats, persistence infrastructure, queues, observability, document/media processing, or a substantial reusable UI behavior. Also investigate when the planned custom implementation would duplicate a common ecosystem capability or introduce a long-lived maintenance burden.

Do not search merely for ordinary business rules, simple data transformations, small local utilities, or behavior already covered well by the current stack.

## Selection workflow

1. Inspect the relevant manifests, lock files, imports, and framework version. Prefer a suitable dependency or capability already present in the project.
2. Formulate focused search queries yourself. Use current primary sources such as official documentation, package registries, release notes, security advisories, and upstream repositories; dependency status changes over time.
3. Compare no more than three credible options. Discard candidates that are incompatible, abandoned, insecure, incorrectly licensed, or disproportionate to the requirement.
4. For each remaining option, state concise advantages and disadvantages grounded in this project's stack and task. Consider API fit, maintenance, release activity, adoption, license, security history, transitive weight, runtime or browser cost, and migration risk only where relevant.
5. Recommend one option, or recommend no new dependency when built-in functionality or a small local implementation is safer and simpler. Do not present several options without a decision unless the choice depends on a genuine product or architectural tradeoff.
6. Classify the recommended change's project impact as low, medium, or high and explain the concrete reason in one sentence.

Keep the investigation proportional: make one focused pass, avoid exhaustive catalogs, and stop once evidence clearly supports a choice.

## Installation boundary

Searching, comparing, and recommending are autonomous. Adding, removing, replacing, or upgrading a dependency is not — except inside the pre-approved scope below.

Before changing any manifest, lock file, container image, build configuration, or generated dependency artifact, present the recommendation, alternatives when relevant, project-impact level, and the exact dependency change. Obtain explicit user approval even when the assessed impact is low or the broader feature implementation was already requested.

### Pre-approved scope (approved 12.09.2026)

The stack below is settled. Adding a package **from this list**, or a package that is a direct and unavoidable requirement of one already on it, needs no fresh approval — pin the version, update the lock file, and record the addition in your report.

Backend: `fastapi` · `pydantic` · `pydantic-settings` · `sqlalchemy[asyncio]` · `alembic` · `asyncpg` · `pgvector` · `uvicorn` · `pyjwt` · `argon2-cffi` · `email-validator` · `openai` · `anthropic` · `python-multipart` · `aiofiles` · `Pillow` · `pypdfium2` · `pypdf` · `python-docx` · `openpyxl` · `arq` · `redis` · `sse-starlette` · `slowapi` · `structlog` · `httpx` · `aiogram`

Frontend: `react` · `react-dom` · `react-router-dom` · `@tanstack/react-query` · `react-hook-form` · `zod` · `@hookform/resolvers` · `lucide-react` · `three` · `@react-three/fiber` · `vite` · `typescript` · `vite-plugin-pwa`

Infrastructure: `postgres` (with pgvector) · `redis`.

Approval is still required — regardless of this list — for any of the following: a package outside the list that opens a **new capability area**; a **copyleft** licence (GPL/AGPL/SSPL); a **new container or service** in `compose.yaml`; **replacing or removing** an existing dependency; a **major-version upgrade** of anything already pinned; anything pulling a **system-level** dependency into the image (OCR engines, browser binaries, native toolchains).

After approval, use the project's native package manager, pin versions according to repository conventions, update lock files, and run only the checks needed for the affected integration. Never implement custom authentication, token signing, password hashing, cryptography, or protocol handling merely to avoid this approval boundary.
