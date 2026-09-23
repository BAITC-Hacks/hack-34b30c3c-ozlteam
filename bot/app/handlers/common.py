from aiogram import Router
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from app.services.api import ApiClient

router = Router(name="common")


@router.message(CommandStart())
async def start(message: Message):
    await message.answer("Hackalem bot готов. /status — проверить API.")


@router.message(Command("status"))
async def status(message: Message, api: ApiClient):
    ready = await api.is_ready()
    await message.answer("API доступен ✅" if ready else "API пока недоступен")
