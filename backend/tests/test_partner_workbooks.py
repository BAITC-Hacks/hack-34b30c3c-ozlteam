import io
import json

from openpyxl import Workbook

from app.Domains.DataImports.adapters.partner_workbooks import parse_partner_files
from app.Domains.DataImports.DTO.rows import ROW_ADAPTER


def xlsx(rows, sheet_name="Лист_1"):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    for values in rows:
        sheet.append(values)
    stream = io.BytesIO()
    workbook.save(stream)
    return stream.getvalue()


SALES_HEADER = ["Дата", "Номер", "Документ", "Код", "Номенклатура", "Ед.", "Склад", "Количество"]


def sale(code="0001_", quantity=10, stamp="01.09.2026 10:00:00", number="001"):
    return [
        stamp,
        number,
        f"Расходная накладная {number} от {stamp[:10]}",
        code,
        "Товар",
        "шт",
        "Алматы",
        quantity,
    ]


def test_union_preserves_codes_and_quarantines_negative_unknown_and_invalid_quantities():
    unknown = sale(quantity=7)
    unknown[2] = "Заказ покупателя 001 от 01.09.2026"
    content = xlsx([SALES_HEADER, sale(), sale(quantity=-3), sale(quantity=None), unknown])
    terms = xlsx(
        [
            ["№", "Код 1с", "Артикул поставщика", "Наименование", "Мин. разр. к отгр."],
            [1, "0002_", "SKU2", "Другой товар", 6],
        ]
    )
    result = parse_partner_files([("Динамика IEK.xlsx", content), ("MOQ IEK.xlsx", terms)], {})
    assert {p["code"] for p in result["products"]} == {"0001_", "0002_"}
    sales = [r for r in result["rows"] if r["kind"] == "sales"]
    assert len(sales) == 1 and sales[0]["quantity"] == "10"
    assert sales[0]["product_external_id"] == "ekt:product:0001_"
    assert {i["code"] for i in result["issues"]} >= {
        "negative_sale_quarantined",
        "invalid_sale_quantity",
        "unknown_operation",
    }
    assert all(p["status"] == "blocked" for p in result["products"])
    product_rows = [r for r in result["rows"] if r["kind"] == "products"]
    assert all(r["data_quality"]["supplier_terms_known"] is False for r in product_rows)
    assert all(r["data_quality"]["supplier_terms_semantics"] is None for r in product_rows)
    assert len([c for c in result["controls"] if c["kind"] == "quarantined_sale"]) == 3
    json.dumps(result)


def test_replay_and_reordering_preserve_sales_identity_and_year_avoids_document_collision():
    a, b = sale(), sale(stamp="01.09.2025 10:00:00")
    first = parse_partner_files([("Динамика IEK.xlsx", xlsx([SALES_HEADER, a, b, a]))], {})
    second = parse_partner_files([("Динамика IEK renamed.xlsx", xlsx([SALES_HEADER, b, a, a]))], {})

    def ids(result):
        return {r["external_id"] for r in result["rows"] if r["kind"] == "sales"}

    assert len(ids(first)) == 3
    assert ids(first) == ids(second)


def test_monthly_history_never_becomes_daily_sales_or_stockout_and_stale_stock_blocks():
    content = xlsx(
        [
            ["Номенклатура", "Ед.", "Номенклатура.Код", "авг. 2026", "сент. 2026"],
            [None, None, None, "Количество", "Количество"],
            [None, None, None, "нач. остаток", "нач. остаток"],
            ["Товар", "шт", "0001_", None, 5],
        ]
    )
    result = parse_partner_files(
        [("Ежемесячные остатки IEK.xlsx", content)],
        {"warehouse_mapping": {"iek.monthly_stocks": "Алматы"}},
    )
    stocks = [r for r in result["rows"] if r["kind"] == "stocks"]
    assert len(stocks) == 1 and stocks[0]["as_of"] == "2026-09-01T00:00:00+05:00"
    assert not any(r["kind"] in ("sales", "stockouts") for r in result["rows"])
    assert "current_stock_stale" in result["products"][0]["reasons"]
    monthly = next(c for c in result["controls"] if c["kind"] == "monthly_stocks")
    assert monthly["cells"][3] is None


def test_explicit_stock_and_conditions_enable_limited_product_without_fake_client_or_stockout():
    content = xlsx([SALES_HEADER, sale()])
    terms = xlsx(
        [
            ["№", "Код 1с", "Артикул поставщика", "Наименование", "Мин. разр. к отгр."],
            [1, "0001_", "SKU1", "Товар", 6],
        ]
    )
    result = parse_partner_files(
        [("Динамика IEK.xlsx", content), ("MOQ IEK.xlsx", terms)],
        {
            "lead_time_days": 14,
            "moq_semantics": "pack",
            "stock_overrides": {
                "0001_": {
                    "quantity": 20,
                    "reserved": 3,
                    "warehouse": "Алматы",
                    "as_of": "2026-09-22",
                }
            },
        },
    )
    assert result["products"][0]["status"] == "limited"
    product = next(r for r in result["rows"] if r["kind"] == "products")
    assert product["pack_size"] == "6" and product["min_order_qty"] == "0"
    assert product["data_quality"]["supplier_terms_known"] is True
    assert product["data_quality"]["supplier_terms_semantics"] == "pack"
    assert {"client_history_unavailable", "stockout_unavailable"} <= set(
        product["data_quality"]["reasons"]
    )
    for record in result["rows"]:
        record = dict(record)
        record.pop("data_quality", None)
        ROW_ADAPTER.validate_python(record)


def test_systeme_stock_uses_total_and_reserve_once_and_source_date_not_request_date():
    header = [None] * 70
    header[2:5] = ["Код 1с", "Наименование", "Категория 2026"]
    data = [None] * 70
    data[1:5] = ["SKU", "0001_", "Товар", "3"]
    data[49:52] = [20, 3, 17]
    data[54] = 7
    result = parse_partner_files(
        [
            (
                "Товар в пути_SystemElectric на 22.09.2026.xlsx",
                xlsx([["СКЛАДЫ"], header, data], "TDSheet"),
            )
        ],
        {
            "as_of": "2026-10-01",
            "warehouse_mapping": {"systeme.current_stock": "Алматы", "systeme.inbound": "Алматы"},
        },
    )
    stock = next(r for r in result["rows"] if r["kind"] == "stocks")
    assert stock["quantity"] == "20" and stock["reserved"] == "3"
    assert stock["as_of"] == "2026-09-22T00:00:00+05:00"
    delivery = next(r for r in result["rows"] if r["kind"] == "inbound")
    assert delivery["expected_date"] == "2026-09-24"
    assert "current_stock_stale" in result["products"][0]["reasons"]


def test_iek_inbound_zero_section_header_retains_evidence_without_phantom_product():
    source = xlsx(
        [
            ["Код 1с", "Артикул ИЭК", "Наименование", "УТ-1 (поступление до 30.09.2026)"],
            ["0001_", "SKU1", "Товар", 2],
            [0, "Расширение 3кв 24", None, None],
            ["0002_", "SKU2", "Другой товар", None],
        ]
    )
    result = parse_partner_files([("Путь ИЭК 22.09.2026.xlsx", source)], {})
    assert {product["code"] for product in result["products"]} == {"0001_", "0002_"}
    evidence = next(c for c in result["controls"] if c["kind"] == "inbound_section_header")
    assert evidence["row"] == 3
    assert evidence["cells"] == [0, "Расширение 3кв 24", None, None]
    assert any(i["code"] == "inbound_section_header" for i in result["issues"])
