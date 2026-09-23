"""Keep a narrow test-order clarification without replaying private assistant facts."""

import re

TEST_ORDER_OFFER = (
    "Могу подготовить тестовый заказ: система выберет товары по вашей просьбе "
    "и поставит по 1 единице каждого. Подготовить предложение?"
)


def test_order_offer(content: str) -> str | None:
    """Only preserve the meaning of an offered test, never names, IDs or stock facts."""
    patterns = (
        r"\bтестов\w*\s+(?:заказ\w*|предложени\w*|черновик\w*)",
        r"\bпо\s+1\s+(?:шт\w*|единиц\w*)",
        r"(?:подтвердите|подготовить\s+предложение\?|нужен\s+именно)",
    )
    if all(re.search(pattern, content, re.I) for pattern in patterns):
        return TEST_ORDER_OFFER
    return None


def accepted_test_request(messages: list[dict]) -> str | None:
    """A short affirmative refers only to the immediately preceding test offer."""
    accepted = None
    for previous, current in zip(messages, messages[1:]):
        if (
            previous.get("role") == "assistant"
            and previous.get("content") == TEST_ORDER_OFFER
            and current.get("role") == "user"
            and re.fullmatch(
                r"\s*(?:да(?:\s*[,—-]?\s*(?:сделай|создай|подготовь|давай))?|"
                r"сделай|давай|подтверждаю|согласен|согласна)[.!\s]*",
                current.get("content", ""),
                re.I,
            )
        ):
            accepted = current["content"]
    return accepted
