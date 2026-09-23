"""Conservative supplier suggestions and evidence checks for manual draft proposals."""

import re
import unicodedata
from decimal import Decimal
from difflib import SequenceMatcher


def normalized(value: str) -> str:
    return " ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", value).casefold()))


def supplier_matches(query: str, suppliers: list[dict]) -> dict:
    needle = normalized(query)
    exact = [row for row in suppliers if normalized(row["name"]) == needle or row["id"] == query]
    if exact:
        return {"match": "exact" if len(exact) == 1 else "ambiguous", "items": exact}
    # Transliteration only ranks suggestions. It never establishes an accepted identity.
    aliases = str.maketrans({"и": "i", "э": "e", "к": "k", "с": "s", "т": "t", "м": "m"})
    needle = needle.translate(aliases)
    ranked = sorted(
        (
            (SequenceMatcher(None, needle, normalized(row["name"]).translate(aliases)).ratio(), row)
            for row in suppliers
        ),
        key=lambda item: (-item[0], item[1]["name"], item[1]["id"]),
    )
    candidates = [row for score, row in ranked if score >= 0.4][:5]
    return {
        "match": "similar" if candidates else "none",
        "items": candidates,
        "requires_clarification": True,
        "instruction": "Попросите назвать выбранного поставщика точно или указать UUID.",
    }


def quoted_by_user(quote: str, messages: list[str]) -> bool:
    return any(
        re.search(r"(?<!\w)" + re.escape(quote) + r"(?!\w)", message, re.I) for message in messages
    )


def supplier_is_explicit(command, suppliers: list[dict], messages: list[str]) -> bool:
    quote = command.supplier_request_text
    if not quoted_by_user(quote, messages):
        return False
    matches = supplier_matches(quote, suppliers)
    resolved = (
        matches["match"] == "exact"
        and len(matches["items"]) == 1
        and matches["items"][0]["id"] == str(command.supplier_id)
    )
    if not resolved:
        return False
    for message in reversed(messages):
        named_ids = {row["id"] for row in suppliers if quoted_by_user(row["id"], [message])}
        if named_ids:
            return named_ids == {str(command.supplier_id)}
        named = [row for row in suppliers if quoted_by_user(row["name"], [message])]
        if named:
            return {row["id"] for row in named} == {str(command.supplier_id)}
    return False


def quantities_are_explicit(command, preview: dict, messages: list[str]) -> bool:
    products = {str(row["product_id"]): row for row in preview["lines"]}
    for line in command.lines:
        quote = line.request_text
        if not quoted_by_user(quote, messages):
            return False
        product = products[str(line.product_id)]
        aliases = [str(product.get(key, "")) for key in ("sku", "code", "name", "product_id")]
        alias = next(
            (
                value
                for value in sorted(aliases, key=len, reverse=True)
                if value and re.search(r"(?<!\w)" + re.escape(value) + r"(?!\w)", quote, re.I)
            ),
            None,
        )
        if not alias:
            return False
        latest = next(
            (message for message in reversed(messages) if quoted_by_user(alias, [message])), None
        )
        if latest is None or not quoted_by_user(quote, [latest]):
            return False
        # Remove the identity before extracting an amount: digits in SKUs/UUIDs are not quantities.
        remaining = re.sub(re.escape(alias), " ", quote, flags=re.I)
        amounts = re.findall(r"(?<![\w.,])[-+]?\d+(?:[.,]\d+)?(?![\w.,])", remaining)
        if len(amounts) != 1 or Decimal(amounts[0].replace(",", ".")) != line.quantity:
            return False
    return True


def test_selection_is_explicit(
    command, messages: list[str], *, accepted_test_request: str | None = None
) -> bool:
    """A test-only delegation must be evidenced by actual user text, never model assertions."""
    test_quote, selection = command.test_request_text, command.selection_request_text
    if not quoted_by_user(test_quote, messages) or not quoted_by_user(selection, messages):
        return False
    test_pattern = r"\b(?:тест\w*|демо\w*|test|demo)\b"
    # The conversation resolver supplies this only for an affirmative immediately
    # following a bounded test offer. It is still an actual user message, not a
    # model-authored test request or inferred permission from an assistant reply.
    accepted = bool(accepted_test_request and test_quote == accepted_test_request)
    order_messages = messages
    if accepted:
        accepted_index = next(
            (i for i in range(len(messages) - 1, -1, -1) if messages[i] == accepted_test_request),
            None,
        )
        if accepted_index is None:
            return False
        order_messages = messages[accepted_index + 1 :]
        latest_test = next(
            (m for m in reversed(order_messages) if re.search(test_pattern, m, re.I)), ""
        )
    else:
        if not re.search(test_pattern, test_quote, re.I):
            return False
        latest_test = next((m for m in reversed(messages) if re.search(test_pattern, m, re.I)), "")
        if not quoted_by_user(test_quote, [latest_test]):
            return False
    if re.search(r"\b(?:не|без|not)\s+(?:тест\w*|демо\w*|test|demo)\b", latest_test, re.I):
        return False
    arbitrary = r"\b(?:люб(?:ые|ых|ой|ую|ыми)|произвольн\w*|случайн\w*|any|arbitrary)\b"
    self_selection = r"\b(?:выбери|подбери|возьми)\b[^.!?\n]*\bсам(?:а|остоятельно)?\b"
    if not (re.search(arbitrary, selection, re.I) or re.search(self_selection, selection, re.I)):
        return False
    if re.search(r"\bне\s+(?:люб\w*|выбирай|подбирай|бери)\b", latest_test, re.I):
        return False
    latest_order_request = next(
        (
            message
            for message in reversed(order_messages)
            if re.search(r"\b(?:создай|сделай|подготовь)\b.*\bзаказ\w*", message, re.I)
        ),
        "",
    )
    if latest_order_request and not re.search(test_pattern, latest_order_request, re.I):
        return False
    numbers = {
        "один": 1,
        "одну": 1,
        "два": 2,
        "две": 2,
        "три": 3,
        "четыре": 4,
        "пять": 5,
        "шесть": 6,
        "семь": 7,
        "восемь": 8,
        "девять": 9,
        "десять": 10,
        "одиннадцать": 11,
        "двенадцать": 12,
        "тринадцать": 13,
        "четырнадцать": 14,
        "пятнадцать": 15,
        "шестнадцать": 16,
        "семнадцать": 17,
        "восемнадцать": 18,
        "девятнадцать": 19,
        "двадцать": 20,
    }
    # Word order is flexible: «любые пять товаров» and «5 любых товаров»
    # delegate the same selection. Keep modifiers bounded to selection language
    # so unrelated numbers (SKU, quantity per line) cannot become the item count.
    modifier = (
        r"(?:люб\w*|произвольн\w*|случайн\w*|разн\w*|доступн\w*|"
        r"any|arbitrary|random|different|available)"
    )
    count_pattern = (
        r"(?<![\w.,+\-])(\d+|" + "|".join(numbers) + r")\s+(?:" + modifier + r"\s+)*"
        r"(?:товар\w*|позиц\w*|products?|items?)\b"
    )
    latest_selection = next(
        (m for m in reversed(messages) if re.search(count_pattern, m, re.I)), ""
    )
    if not quoted_by_user(selection, [latest_selection]):
        return False
    if re.search(
        r"\b(?:не|not)\s+(?:люб\w*|произвольн\w*|случайн\w*|any|arbitrary)\b",
        latest_selection,
        re.I,
    ):
        return False
    counts = re.findall(count_pattern, selection.casefold())
    return (
        len(counts) == 1
        and (int(counts[0]) if counts[0].isdigit() else numbers[counts[0]]) == command.product_count
    )
