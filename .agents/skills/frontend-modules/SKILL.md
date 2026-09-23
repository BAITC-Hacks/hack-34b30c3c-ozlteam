---
name: frontend-modules
description: Implement React SPA pages, features and reusable components in this project's Vite and TypeScript modular frontend, preserving PWA and hot reload behavior.
---

Use `frontend/src/modules/notes` as the example. `app` composes the application; each `modules/<name>` owns its pages, components, hooks, API calls and types. Export the public entrypoints from its `index.ts`. Import other modules through public entrypoints, avoiding cycles.

Place reusable UI primitives in `shared/ui`, transport code in `shared/api`, and genuinely shared utilities in focused shared folders. A reusable search capability with behavior/API/state belongs in its own module; a basic input primitive can be shared UI. Keep module-only code inside its module until actual reuse appears.

Split by responsibility rather than an arbitrary file length: page composition, fetching/state, forms and list items should remain understandable separately. Do not build a single component containing the entire screen and network orchestration. Prefer clear composition over generic components with many mode flags.

Use the shared API client and relative `/api` URLs; Vite proxies them to the backend. Include loading, empty, error and pending states, accessible labels and keyboard behavior. Abort or otherwise guard stale fetches. Validate TypeScript without `any` escapes. Never put tokens in `VITE_*`.

Preserve bind mounts, the separate `node_modules` volume, and Vite polling in Docker. Source edits need no rebuild. Keep PWA service workers disabled in development; production caches only the app shell, never API responses by default. Keep update prompts so updates do not silently discard in-progress forms.

Run `docker compose exec frontend npm run build` after code changes. Inspect the affected screen at mobile and desktop widths and verify real interactions. Update `package-lock.json` whenever dependencies change.
