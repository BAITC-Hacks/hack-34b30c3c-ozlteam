import asyncio
import logging

import httpx
from aiogram import Bot, Dispatcher

from app.config import Settings
from app.handlers.common import router
from app.services.api import ApiClient


async def main():
    settings = Settings()
    token = settings.bot_token.get_secret_value()
    if not token:
        raise SystemExit("Set BOT_TOKEN in .env before starting the bot profile")
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    async with (
        Bot(token=token) as bot,
        httpx.AsyncClient(
            base_url=settings.api_base_url,
            timeout=5,
        ) as client,
    ):
        await dispatcher.start_polling(bot, api=ApiClient(client))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
