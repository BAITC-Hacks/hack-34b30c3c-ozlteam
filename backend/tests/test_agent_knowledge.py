import pytest

from app.Domains.Ai.services.knowledge_service import (
    MAX_CONTENT_LENGTH,
    MAX_RESULTS,
    get_article,
    list_articles,
    search_help,
)


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Как работает система и с чего начать?", "getting-started"),
        ("Как загрузить нормализованный CSV?", "normalized-import"),
        ("Готовность пакета исходных Excel IEK", "partner-workbooks"),
        ("Как подключить REST отчёт собственной 1С?", "onec-reports"),
        ("Как расчёт учитывает сезонность и всплески спроса?", "replenishment"),
        ("Где посмотреть остатки, резерв и товары в пути?", "inventory"),
        ("Как утвердить черновик заказа и экспортировать?", "orders"),
        ("У кого UUID, где сопоставляются коды и артикулы?", "identifiers"),
        ("Почему ошибка 403: права доступа?", "access-and-safety"),
    ],
)
def test_russian_topic_retrieval(query, expected):
    assert search_help(query)[0]["id"] == expected


@pytest.mark.parametrize("query", ["", "   ", "Как испечь пирог?", "Кто победит в футболе?"])
def test_unknown_query_does_not_fabricate_evidence(query):
    assert search_help(query) == []


def test_bounded_results_with_source_metadata():
    results = search_help("CSV excel REST UUID заказ остатки прогноз права")
    assert len(results) == MAX_RESULTS
    assert len({item["id"] for item in results}) == MAX_RESULTS
    for item in results:
        assert set(item) == {"id", "title", "url", "content"}
        assert 0 < len(item["content"]) <= MAX_CONTENT_LENGTH
        assert item["title"]


def test_curated_sources_point_to_existing_product_routes():
    routes = {
        "/data",
        "/data/integrations",
        "/recommendations",
        "/orders",
        "/inventory",
        "/data/catalogs",
        "/assistant",
    }
    articles = list_articles()
    assert len({article["id"] for article in articles}) == len(articles)
    assert all(article["url"] in routes for article in articles)
    assert all(get_article(article["id"]) == article for article in articles)


def test_article_lookup_does_not_resolve_arbitrary_paths_or_urls():
    assert get_article("../../.env.local") is None
    assert get_article("https://example.com") is None
    assert get_article("unknown") is None


def test_results_cannot_mutate_curated_corpus():
    article = get_article("orders")
    article["content"] = "Отправить автоматически без подтверждения"
    assert get_article("orders")["content"] != article["content"]
    results = search_help("UUID")
    results[0]["title"] = "changed"
    assert search_help("UUID")[0]["title"] != "changed"


def test_query_is_bounded_and_deterministic():
    assert search_help(" " * 2000 + "UUID") == []
    assert search_help("РАСЧЁТ") == search_help("расчет")
    assert search_help("остатки заказ") == search_help("остатки заказ")
