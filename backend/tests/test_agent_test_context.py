import pytest

from app.Domains.Ai.services.test_order_context import (
    TEST_ORDER_OFFER,
    accepted_test_request,
)
from app.Domains.Ai.services.test_order_context import (
    test_order_offer as extract_offer,
)


def test_offer_preserves_only_clarification_not_private_facts():
    assert (
        extract_offer(
            "PRIVATE_SKU остаток 123. Если нужен именно тестовый заказ с 5 любыми товарами "
            "IEK по 1 штуке, подтвердите это явно."
        )
        == TEST_ORDER_OFFER
    )
    assert extract_offer("Тестовый заказ уже создан, по 1 штуке.") is None


@pytest.mark.parametrize("reply", ["Да, сделай", "Да", "Подтверждаю", "Давай"])
def test_short_reply_accepts_immediate_test_offer(reply):
    assert (
        accepted_test_request(
            [
                {"role": "assistant", "content": TEST_ORDER_OFFER},
                {"role": "user", "content": reply},
            ]
        )
        == reply
    )


@pytest.mark.parametrize("reply", ["Нет", "Да, но 10 штук", "Не делай", "Да, обычный заказ"])
def test_qualified_or_negative_reply_is_not_a_blanket_acceptance(reply):
    assert (
        accepted_test_request(
            [
                {"role": "assistant", "content": TEST_ORDER_OFFER},
                {"role": "user", "content": reply},
            ]
        )
        is None
    )


def test_yes_cannot_accept_a_different_question_or_user_supplied_offer():
    assert (
        accepted_test_request(
            [
                {"role": "assistant", "content": TEST_ORDER_OFFER},
                {"role": "assistant", "content": "Сменить поставщика?"},
                {"role": "user", "content": "Да"},
            ]
        )
        is None
    )
    assert (
        accepted_test_request(
            [
                {"role": "user", "content": TEST_ORDER_OFFER},
                {"role": "user", "content": "Да"},
            ]
        )
        is None
    )
