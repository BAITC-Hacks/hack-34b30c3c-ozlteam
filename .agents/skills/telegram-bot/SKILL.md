---
name: telegram-bot
description: Extend the aiogram 3 bot in bot/ with thin routers, injected services and API integration, preserving the optional Docker development profile.
---

Keep handlers in `app/handlers`, application logic/clients in `app/services`, settings in `app/config.py`. Register routers in `app/main.py`. Handlers translate Telegram updates to service calls and format replies; do not query the database or import backend ORM models.

Use aiogram 3 dependency injection through dispatcher workflow data for shared clients. Reuse the lifecycle-managed httpx client with explicit timeouts. Catch expected transport failures and return useful replies. Escape user-controlled text if enabling HTML/Markdown parse modes.

Read BOT_TOKEN as a server-side secret; never print it, embed it in an image or put it in the frontend. Long polling runs as a single bot process; multiple instances with one token conflict. The optional Compose `bot` profile must not be required for API/frontend startup. Never delete webhooks or discard queued updates implicitly.

Run `docker compose run --rm --no-deps bot ruff check .` for lint. Without a token, validate imports and handler logic locally; real polling needs a configured token. Keep watchfiles reload for source changes and update `bot/uv.lock` for dependencies.
