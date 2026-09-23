import { Badge, Card } from "../../../shared/ui";
import { useI18n } from "../../../shared/i18n/I18nContext";
import type { Recommendation } from "../types";
import styles from "../pages/ReplenishmentPage.module.css";

const urgency = {
  critical: { label: "Критично", tone: "danger" },
  soon: { label: "Скоро", tone: "warning" },
  normal: { label: "Планово", tone: "neutral" },
} as const;

const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${number((value - 1) * 100)}%`;

export function recommendationKey(row: Recommendation): string {
  return `${row.sku}::${row.warehouse}`;
}

interface Props {
  supplier: string;
  rows: Recommendation[];
  quantities: Record<string, number>;
  onQuantityChange: (key: string, quantity: number) => void;
}

export function RecommendationGroup({ supplier, rows, quantities, onQuantityChange }: Props) {
  const { t } = useI18n();
  const includedRows = rows.filter((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0);
  const total = includedRows.reduce((sum, row) => sum + (quantities[recommendationKey(row)] ?? row.recommended_qty), 0);

  return (
    <Card className={styles.supplierCard} title={supplier} subtitle={`${includedRows.length} ${t("поз.", "позиция", "items")} · ${number(total)} ${t("шт. к заказу", "дана тапсырысқа", "units to order")}`}>
      <div className={styles.recommendations}>
        {rows.map((row) => {
          const key = recommendationKey(row);
          const qty = quantities[key] ?? row.recommended_qty;
          const m = row.metrics;
          return (
            <article className={styles.recommendation} key={key}>
              <div className={styles.rowTop}>
                <div className={styles.product}>
                  <div className={styles.productTitle}><strong>{row.name}</strong><span className={styles.sku}>{row.sku}</span></div>
                  <p>{row.warehouse} · {row.category}</p>
                </div>
                <Badge tone={urgency[row.urgency].tone}>{t(urgency[row.urgency].label, row.urgency === "critical" ? "Өте шұғыл" : row.urgency === "soon" ? "Жақында" : "Жоспарлы", row.urgency === "critical" ? "Critical" : row.urgency === "soon" ? "Soon" : "Planned")}</Badge>
              </div>
              <div className={styles.rowBody}>
                <div className={styles.reason}>
                  <p>{row.explanation}</p>
                  <details className={styles.details}>
                    <summary>{t('Почему столько?', 'Неге осынша?', 'Why this quantity?')}</summary>
                    <dl className={styles.metricGrid}>
                      <div><dt>{t('Продажи за историю', 'Кезеңдегі сатылымдар', 'Historical sales')}</dt><dd>{number(m.raw_sales)} {t("шт.", "дана", "units")}</dd></div>
                      <div><dt>{t('Исключённый всплеск', 'Алып тасталған шарықтау', 'Excluded spike')}</dt><dd>{number(m.excluded_spike_units)} {t("шт.", "дана", "units")}</dd></div>
                      <div><dt>{t('Упущенный спрос', 'Өткізіп алған сұраныс', 'Lost demand')}</dt><dd>{number(m.lost_demand_units)} {t("шт.", "дана", "units")}</dd></div>
                      <div><dt>{t('Спрос в день', 'Күндік сұраныс', 'Daily demand')}</dt><dd>{number(m.adjusted_daily_demand)} {t("шт.", "дана", "units")}</dd></div>
                      <div><dt>{t('Сезонность', 'Маусымдылық', 'Seasonality')}</dt><dd>×{number(m.seasonality_factor)}</dd></div>
                      <div><dt>{t('Тренд', 'Тренд', 'Trend')}</dt><dd>×{number(m.trend_factor)}</dd></div>
                      <div><dt>{t('Рост категории', 'Санат өсімі', 'Category growth')}</dt><dd>{percent(m.category_growth_factor)}</dd></div>
                      <div><dt>{t('На складе / в пути', 'Қоймада / жолда', 'In stock / inbound')}</dt><dd>{number(m.on_hand)} / {number(m.inbound)}</dd></div>
                      <div><dt>{t('Целевой запас', 'Мақсатты қор', 'Target stock')}</dt><dd>{number(m.target_stock)} {t("шт.", "дана", "units")}</dd></div>
                      <div><dt>{t('Позиция запаса', 'Қор позициясы', 'Stock position')}</dt><dd>{number(m.stock_position)} {t("шт.", "дана", "units")}</dd></div>
                      <div><dt>{t('Срок поставки / пересмотр', 'Жеткізу мерзімі / қайта қарау', 'Lead time / review')}</dt><dd>{m.lead_days} / {m.review_days} {t("дн.", "күн", "days")}</dd></div>
                    </dl>
                  </details>
                </div>
                <label className={styles.quantityLabel}>
                  <span>{t('Заказать, шт.', 'Тапсырыс, дана', 'Order, units')}</span>
                  <input
                    className={styles.quantityInput}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="9999999"
                    step="1"
                    value={qty}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value);
                      if (Number.isSafeInteger(next) && next >= 0 && next <= 9999999) onQuantityChange(key, next);
                    }}
                  />
                  {qty !== row.recommended_qty ? <small>{t("Было", "Бұрын", "Was")} {number(row.recommended_qty)}</small> : null}
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
