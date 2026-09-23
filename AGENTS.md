# Hackalem team starter

Read `CONTEXT.md` first: what the product is, who it serves, what is decided and what is still open.
Then read `PROJECT_DIRECTION.md` and apply `.agents/skills/project-alignment/SKILL.md`
for every project task: planning, implementation, review, documentation and status.
Reuse already-read current context; refresh it after relevant Git or user changes.
The selected case is supplier replenishment for Электрокомплект (23.09.2026).
Электрокомплект is the company using this service; IEK/Systeme are initial suppliers/brands,
not separate ERP customers. Demand is the company's own shipments to its clients from its 1C.
There is no retail POS or downstream store-management integration in scope.
Code matching and internal UUIDv7 identities live in our adapter/database, not in stores.
Support arbitrary suppliers; do not hard-code a two-supplier limit.

Read `docs/hackathon/tracklogic.md` before domain/data work. It records workbook schemas,
data gaps and 1C requirements. `docs/TEAM_HANDOFF.md` is the teammate entry point;
`docs/replenishment-case.md` documents acceptance and the separate demo contract.
`CONTEXT_HISTORY.md`, `TrackLogic/hackalem_ai_context.txt`, old retail diagrams and
construction/telematics examples are historical, not current requirements or a roadmap.
The scaffold and design system carry over; product behavior follows the current direction.

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
After completing a change task, auto-push if you have reviewed and approved the entire diff and
relevant checks pass; do not auto-push read-only, unfinished or explicitly local-only work.

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
