"""Human-readable presentation of saved results; never recalculates demand."""

from decimal import ROUND_HALF_UP, Decimal

# Aliases from workbook validation and the calculation engine describe the same gap.
REASONS = (
    (
        {"current_stock_missing", "missing_stock_snapshot", "invalid_stock"},
        "нет достоверного остатка",
        "загрузите актуальные остатки",
    ),
    (
        {"current_stock_stale", "stale_partner_stock_snapshot"},
        "остаток устарел",
        "обновите остатки",
    ),
    (
        {"lead_time_missing", "missing_lead_time"},
        "не указан срок поставки",
        "укажите срок поставки",
    ),
    (
        {"detailed_history_missing", "missing_sales_history"},
        "нет подробной истории продаж",
        "загрузите историю продаж",
    ),
    (
        {
            "stock_warehouse_missing",
            "inbound_warehouse_missing",
            "warehouse_stock_scope_unconfirmed",
        },
        "не сопоставлены склады",
        "сопоставьте склады в настройках импорта",
    ),
    (
        {
            "supplier_terms_missing",
            "supplier_terms_semantics_missing",
            "invalid_supplier_terms",
            "conflicting_supplier_terms",
            "invalid_pack_size",
        },
        "не подтверждены условия заказа",
        "уточните минимальную партию и кратность",
    ),
    (
        {"missing_supplier", "supplier_conflict", "supplier_sku_conflict"},
        "не подтверждён поставщик товара",
        "проверьте поставщика и артикул",
    ),
    (
        {"purchase_unit_conversion_missing", "unit_missing_or_conflicting"},
        "не согласованы единицы измерения",
        "уточните единицы и коэффициент пересчёта",
    ),
    (
        {"incomplete_source_sync", "incomplete_sources"},
        "загрузка источника не завершена",
        "завершите загрузку данных",
    ),
    (
        {"stockout_without_reference"},
        "нет продаж в периоды наличия товара",
        "добавьте историю за периоды наличия",
    ),
    (
        {"horizon_exceeds_730_days"},
        "период планирования превышает 730 дней",
        "проверьте срок поставки и период пересмотра",
    ),
)


def amount(value, unit: str = "", *, estimate: bool = False) -> str:
    number = Decimal(str(value))
    displayed = number
    if estimate:
        places = "1" if unit.lower().rstrip(".") in {"шт", "штука", "штук"} else "0.001"
        displayed = number.quantize(Decimal(places), rounding=ROUND_HALF_UP)
    text = format(displayed, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return ("≈ " if displayed != number else "") + text.replace(".", ",")


def explain_saved(recommendation) -> str:
    details = recommendation.details or {}
    breakdown = details.get("breakdown", {})
    if recommendation.status == "blocked":
        codes = set(details.get("warnings", []))
        matches = [(reason, action) for aliases, reason, action in REASONS if codes & aliases]
        if not matches:
            return (
                "Недостаточно данных для расчёта заказа. "
                "Проверьте готовность товара в разделе «Источники данных»."
            )
        # Keep the table readable; the detail view retains every warning.
        reasons = "; ".join(reason for reason, _ in matches[:3])
        extra = " Есть и другие ограничения — откройте подробности." if len(matches) > 3 else ""
        actions = "; ".join(dict.fromkeys(action for _, action in matches[:3]))
        return f"Недостаточно данных: {reasons}.{extra} Что сделать: {actions}."
    unit = recommendation.unit
    quantity = Decimal(str(recommendation.recommended_quantity))
    title = (
        f"Рекомендуем заказать {amount(quantity)} {unit}."
        if quantity > 0
        else "Пополнение сейчас не требуется."
    )
    required = ("forecast_quantity", "safety_stock", "available_stock", "inbound_quantity")
    if any(breakdown.get(key) is None for key in required):
        return title + " Подробности сохранённого расчёта доступны в обосновании."
    demand, safety, stock, inbound = (
        amount(breakdown[key], unit, estimate=key in {"forecast_quantity", "safety_stock"})
        for key in required
    )
    horizon = breakdown.get("horizon_days")
    period = f"на {horizon} дн." if horizon is not None else "на период пополнения"
    return (
        f"{title} Спрос {period} — {demand} {unit}, страховой запас — {safety} {unit}. "
        f"Доступно {stock} {unit}, поступит в пределах периода — {inbound} {unit}. "
        "Итог учитывает сроки поступлений и условия заказа."
    )
