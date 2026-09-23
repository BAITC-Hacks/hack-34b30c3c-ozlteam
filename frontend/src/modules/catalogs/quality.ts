const reasons: Record<string, string> = {
  client_history_unavailable: "В выгрузке нет обезличенных клиентов: доступен анализ дневных всплесков, но не покупок одного клиента.",
  stockout_unavailable: "Нет точных периодов отсутствия товара; месячные остатки не заменяют ежедневную доступность.",
  lead_time_missing: "Не задан срок поставки.",
  supplier_terms_missing: "Нет условий заказа у поставщика.",
  supplier_terms_semantics_missing: "Не подтверждено, означает MOQ минимальную партию или кратность.",
  purchase_unit_conversion_missing: "Не задан перевод закупочной единицы в единицу учёта.",
  detailed_history_missing: "Нет детальных отгрузок в выбранном периоде.",
  current_stock_missing: "Нет текущего остатка на сопоставленном складе.",
  current_stock_stale: "Последний остаток старше допустимого срока.",
  unit_missing_or_conflicting: "Единица измерения отсутствует или различается между файлами.",
  supplier_sku_conflict: "Одному коду 1С соответствуют разные артикулы поставщика.",
  sku_is_1c_code: "Артикул отсутствует; временно отображается код 1С.",
  category_unclassified: "Категория в исходных данных не задана.",
  supplier_conflict: "Код 1С встречается у разных поставщиков.",
  stock_warehouse_missing: "Не сопоставлен склад остатков.",
  inbound_warehouse_missing: "Не сопоставлен склад будущего поступления.",
  invalid_stock: "Некорректный остаток или резерв.",
  invalid_sale_quantity: "В строке отгрузки отсутствует количество или есть ошибка Excel.",
  negative_sale_quarantined: "Отрицательные строки исключены из спроса и сохранены для проверки.",
  unknown_operation: "Неизвестный тип операции исключён из расчёта спроса.",
  invalid_sale_date: "Не удалось распознать дату отгрузки.",
  outside_history_window: "Строки вне выбранного периода не включены в спрос.",
  missing_sale_dimensions: "В отгрузке не указан склад или единица измерения.",
  invalid_supplier_terms: "Условие поставщика отсутствует или содержит ошибку.",
  conflicting_supplier_terms: "В файлах различаются условия заказа для одного кода.",
  conflicting_fact: "Один и тот же факт содержит разные значения.",
  warehouse_stock_scope_unconfirmed: "Не подтверждено, какие складские колонки входят в общий остаток.",
};

export function dataQualityReason(code: string): string {
  return reasons[code] ?? `Требуется проверка: ${code}`;
}
