# Hackalem team starter

Read `CONTEXT.md` first: what the product is, who it serves, what is decided and what is still open.
The industry changed on 21.09.2026 — the team is now on track 05, Logistics, and the construction
material in the prototype no longer applies. The selected case is supplier replenishment for
Elektrokomplekt. Read `docs/TEAM_HANDOFF.md` and `docs/replenishment-case.md` before product work;
the replenishment demo uses synthetic data. The shell, design system and UI kit carry over unchanged.
Earlier trade-document research in `docs/logistic` is background, not the current case.

Before substantial work read `.agents/skills/task-delegation/SKILL.md`. Proactively delegate useful independent subtasks, with a clear plan and file ownership; the main agent integrates and verifies the result. No additional permission is needed for delegation.

Before changing any tracked text or code file read `.agents/skills/surgical-patches/SKILL.md`.
Before backend changes read `.agents/skills/backend-domains/SKILL.md`.
Before changing API routes, DTOs, responses, auth/error/stream contracts or frontend API integration, read `.agents/skills/swagger-openapi/SKILL.md` and keep `/docs` and `/openapi.json` accurate for frontend agents and people.
Before frontend changes read `.agents/skills/frontend-modules/SKILL.md`.
Before any UI work read `.agents/skills/project-design/SKILL.md`; it points to `docs/design-system.md`, the tokens and the UI kit.
When creating or changing cards, read `.agents/skills/card-loading-skeletons/SKILL.md` and include a content-shaped shimmer skeleton when the card has a meaningful initial wait.
When creating or changing forms, detail pages, or Back buttons, read `.agents/skills/contextual-back-navigation/SKILL.md` and preserve the entry route with a defined fallback.
Before any UI or visual design work read `.agents/skills/apple-design/SKILL.md` (vendored, see its `SOURCE.md`).
Before bot changes read `.agents/skills/telegram-bot/SKILL.md`.
Before touching the manifest, service worker, install prompts, push notifications or planning a mobile demo read `.agents/skills/pwa-delivery/SKILL.md`.
Before pulling or pushing Git changes read `.agents/skills/git-team-workflow/SKILL.md`.
Before publishing Git changes also read `.agents/skills/git-publish/SKILL.md`; follow its single-commit and branch merge workflow.

Team Git shorthand: a user message `ПУШ` means publish the current work to Git; `ПУЛЛ` means
synchronize the current branch from Git. Before every push, fetch and integrate the latest remote
changes, then resolve conflicts while preserving all three collaborators' work. Check Git status
and remote changes regularly during shared work; never discard another collaborator's changes.

- Development starts with `make dev` (uses `.env.local` via `scripts/dev.sh`). Follow README.md for checks.
- Preserve hot reload and source bind mounts. Dependency changes require updating lock files.
- Backend domain directory is exactly `backend/app/Domains/<Name>` (case sensitive).
- Keep controllers/handlers thin. Business operations belong to services, SQL to repositories.
- Frontend uses `src/modules/<name>` for module-owned code and `src/shared` for shared code.
- Do not create placeholder abstractions or empty domain directories for hypothetical features.
- Register new SQLAlchemy models in `backend/migrations/env.py` and create Alembic migrations.
- Never use `create_all` as a replacement for migrations.
- Keep all secrets server-side; `VITE_*` variables are public browser configuration.
- This Compose file is for local development; public deployment requires a separate production configuration.
