from app.Domains.Ai.contracts import LlmProvider, Message
from app.Domains.Ai.DTO.chat import AskAssistant

SYSTEM_PROMPT = (
    "Ты «Логист» — ассистент транспортно-логистической компании. Отвечай по-русски, коротко "
    "и по делу, как опытный логист: сначала вывод, потом основание. Знаешь товаросопроводительные "
    "документы (накладная, ТТН, CMR, инвойс, упаковочный лист, таможенная декларация), приёмку "
    "с расхождениями, сроки доставки и претензионную работу. Не выдумывай ставки, сроки и нормы "
    "права: если данных нет, так и скажи и назови, что нужно уточнить. Не предлагай выполнить "
    "действие в системе от имени пользователя — только подскажи, что сделать."
)


class AssistantService:
    """Один вопрос к модели с историей диалога. Состояние живёт у клиента."""

    def __init__(self, provider: LlmProvider) -> None:
        self.provider = provider

    async def ask(self, command: AskAssistant) -> str:
        messages: list[Message] = [
            {"role": turn.role, "content": turn.content} for turn in command.history
        ]
        messages.append({"role": "user", "content": command.question})
        return await self.provider.complete(system=SYSTEM_PROMPT, messages=messages)
