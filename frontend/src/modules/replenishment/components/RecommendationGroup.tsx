import { Badge, Card } from "../../../shared/ui";
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
  const includedRows = rows.filter((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0);
  const total = includedRows.reduce((sum, row) => sum + (quantities[recommendationKey(row)] ?? row.recommended_qty), 0);

  return (
    <Card className={styles.supplierCard} title={supplier} subtitle={`${includedRows.length} поз. · ${number(total)} шт. к заказу`}>
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
                <Badge tone={urgency[row.urgency].tone}>{urgency[row.urgency].label}</Badge>
              </div>
              <div className={styles.rowBody}>
                <div className={styles.reason}>
                  <p>{row.explanation}</p>
                  <details className={styles.details}>
                    <summary>Почему столько?</summary>
                    <dl className={styles.metricGrid}>
                      <div><dt>Продажи за историю</dt><dd>{number(m.raw_sales)} шт.</dd></div>
                      <div><dt>Исключённый всплеск</dt><dd>{number(m.excluded_spike_units)} шт.</dd></div>
                      <div><dt>Упущенный спрос</dt><dd>{number(m.lost_demand_units)} шт.</dd></div>
                      <div><dt>Спрос в день</dt><dd>{number(m.adjusted_daily_demand)} шт.</dd></div>
                      <div><dt>Сезонность</dt><dd>×{number(m.seasonality_factor)}</dd></div>
                      <div><dt>Тренд</dt><dd>×{number(m.trend_factor)}</dd></div>
                      <div><dt>Рост категории</dt><dd>{percent(m.category_growth_factor)}</dd></div>
                      <div><dt>На складе / в пути</dt><dd>{number(m.on_hand)} / {number(m.inbound)}</dd></div>
                      <div><dt>Целевой запас</dt><dd>{number(m.target_stock)} шт.</dd></div>
                      <div><dt>Позиция запаса</dt><dd>{number(m.stock_position)} шт.</dd></div>
                      <div><dt>Срок поставки / пересмотр</dt><dd>{m.lead_days} / {m.review_days} дн.</dd></div>
                    </dl>
                  </details>
                </div>
                <label className={styles.quantityLabel}>
                  <span>Заказать, шт.</span>
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
                  {qty !== row.recommended_qty ? <small>Было {number(row.recommended_qty)}</small> : null}
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
