import type { SavedRecommendationDetail } from "../runTypes";

const warningGroups: Array<[string[], string]> = [
  [["current_stock_missing", "missing_stock_snapshot", "invalid_stock"], "Нет достоверного остатка: загрузите актуальные остатки."],
  [["current_stock_stale", "stale_partner_stock_snapshot", "stale_stock_snapshot"], "Остаток устарел: обновите данные на дату расчёта."],
  [["lead_time_missing", "missing_lead_time"], "Не указан срок поставки."],
  [["detailed_history_missing", "missing_sales_history"], "Нет подробной истории продаж за выбранный период."],
  [["supplier_terms_missing", "supplier_terms_semantics_missing", "invalid_supplier_terms", "conflicting_supplier_terms", "invalid_pack_size"], "Уточните минимальную партию и кратность заказа у поставщика."],
  [["stock_warehouse_missing", "inbound_warehouse_missing", "warehouse_stock_scope_unconfirmed"], "Сопоставьте склады в настройках импорта."],
  [["missing_supplier", "supplier_conflict", "supplier_sku_conflict"], "Проверьте поставщика и артикул товара."],
  [["purchase_unit_conversion_missing", "unit_missing_or_conflicting"], "Уточните единицы измерения и коэффициент пересчёта."],
  [["incomplete_source_sync", "incomplete_sources"], "Завершите загрузку источника данных."],
  [["stockout_without_reference"], "Нет продаж в периоды наличия товара: восстановить спрос не из чего."],
  [["horizon_exceeds_730_days"], "Период планирования превышает 730 дней: проверьте настройки."],
  [["client_history_unavailable", "missing_client_ids_day_level_outliers_only"], "Нет обезличенных ID клиентов: крупные продажи проверены только по дням."],
  [["stockout_unavailable"], "Нет точных периодов отсутствия товара: упущенный спрос нельзя надёжно оценить."],
  [["insufficient_history_for_annual_seasonality"], "Истории недостаточно для годового сезонного профиля."],
  [["overdue_inbound_excluded"], "Просроченные поставки исключены из будущих поступлений."],
  [["sku_is_1c_code"], "Артикул отсутствует; отображается код 1С."],
  [["category_unclassified"], "Категория товара не задана."],
  [["no_successful_calculation"], "Успешных расчётов пока нет."],
];

export function describeWarnings(values: string[]): string {
  const codes = new Set(values);
  const messages = warningGroups.filter(([aliases]) => aliases.some((code) => codes.has(code))).map(([, text]) => text);
  const known = new Set(warningGroups.flatMap(([aliases]) => aliases));
  if (values.some((code) => !known.has(code))) messages.push("Есть дополнительные ограничения: проверьте готовность товара в источниках данных.");
  return messages.join(" ");
}

/** Display rounding never changes quantities sent to the API. */
export function formatQuantity(value: string | number | null | undefined, unit = "", estimate = false): string {
  if (value == null || value === "") return "Нет данных";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Нет данных";
  if (!estimate) {
    const [whole, fraction = ""] = String(value).split(".");
    const decimal = fraction.replace(/0+$/, "");
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${decimal ? `,${decimal}` : ""}`;
  }
  const digits = /^(шт\.?|штука|штук)$/i.test(unit) ? 0 : 3;
  const rounded = Number(number.toFixed(digits));
  return `${rounded !== number ? "≈ " : ""}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(rounded)}`;
}

export function breakdownValue(detail: SavedRecommendationDetail, key: string): string {
  const warnings = detail.details.warnings;
  const has = (...codes: string[]) => codes.some((code) => warnings.includes(code));
  if (key === "recommended_quantity" && detail.status === "blocked") return "—";
  if (key === "available_stock" && has("current_stock_missing", "missing_stock_snapshot", "invalid_stock", "stock_warehouse_missing", "warehouse_stock_scope_unconfirmed")) return "Нет данных";
  if (key === "inbound_quantity" && has("inbound_warehouse_missing", "purchase_unit_conversion_missing")) return "Нет данных";
  if (["lead_time_days", "horizon_days"].includes(key) && has("lead_time_missing", "missing_lead_time")) return "Нет данных";
  if (["forecast_quantity", "safety_stock", "baseline_daily", "raw_sales", "corrected_sales"].includes(key) && has("detailed_history_missing", "missing_sales_history")) return "Нет данных";
  if (key === "lost_demand" && has("stockout_unavailable")) return "Нет данных";
  const value = detail.details.breakdown[key];
  if (value == null) return "Нет данных";
  if (key === "seasonality_method") return ({ product_monthly: "Помесячно по товару", category_monthly: "Помесячно по категории", flat_short_history: "Без сезонного профиля: мало истории" } as Record<string, string>)[String(value)] ?? "Нет данных";
  if (!/^-?\d+(\.\d+)?$/.test(String(value))) return String(value);
  const rate = ["baseline_daily", "trend_daily_slope"].includes(key);
  return formatQuantity(value, rate ? "" : detail.unit, rate || ["forecast_quantity", "safety_stock", "lost_demand", "unrounded_quantity", "rounding_increment", "excess_quantity"].includes(key));
}

export function breakdownQuantity(detail: SavedRecommendationDetail, key: string): string {
  const value = breakdownValue(detail, key);
  return value === "Нет данных" || value === "—" ? value : `${value} ${detail.unit}`;
}
