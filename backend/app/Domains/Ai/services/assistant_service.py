from app.Domains.Ai.contracts import LlmProvider, Message
from app.Domains.Ai.DTO.chat import AskAssistant

SYSTEM_PROMPT = (
    "Ты «Логист» — ассистент менеджера закупок ТОО «Электрокомплект». Помогаешь разбирать "
    "рекомендации по пополнению собственного склада: спрос из отгрузок клиентам, остатки, "
    "товары в пути, срок поставки, минимальную партию и кратность. Отвечай по-русски, коротко "
    "и по делу: сначала вывод, затем основание и данные, которые нужно проверить. Не выдумывай "
    "остатки, цены, сроки, поставщиков, соответствия товаров или результаты расчётов. Если "
    "данных нет, так и скажи. Не изменяй рекомендации и не создавай заказы от имени пользователя: "
    "только подсказывай, что менеджеру проверить или сделать."
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
