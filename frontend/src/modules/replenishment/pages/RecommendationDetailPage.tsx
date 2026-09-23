import { ArrowLeft, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { Alert, Badge, Button, Card, EmptyState, Table, Td, Th, Tr } from "../../../shared/ui";
import { getRecommendation, getRun } from "../api/runs";
import type { Run, SavedRecommendationDetail } from "../runTypes";
import styles from "./RecommendationDetailPage.module.css";

type Point = { date: string; value: number; secondary?: number; stockout?: boolean };

const fields = [
  ["forecast_quantity", "Прогноз спроса"], ["safety_stock", "Страховой запас"],
  ["available_stock", "Доступный остаток"], ["inbound_quantity", "В пути до пополнения"],
  ["unrounded_quantity", "Потребность до округления"], ["rounding_increment", "Округление"],
  ["recommended_quantity", "Рекомендуемый заказ"],
] as const;

function number(value: number | string | null | undefined): number { return Number(value ?? 0) || 0; }
function qty(value: number | string | null | undefined): string {
  const amount = number(value);
  if (amount !== 0 && Math.abs(amount) < 1e-12) return String(value);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 12 }).format(amount);
}
function date(value: string | null | undefined): string { return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("ru-RU") : "—"; }
function display(value: number | string | null | undefined): string { return value == null || value === "" ? "—" : /^-?\d+(\.\d+)?$/.test(String(value)) ? qty(value) : String(value); }
function explanation(value: string): string { return value.replace(/\b\d+\.\d{4,}\b/g, (match) => qty(match)); }
function inboundStatus(value: string): string { return ({ in_transit: "В пути", confirmed: "Подтверждено", planned: "Запланировано", received: "Получено" } as Record<string, string>)[value] ?? value; }
const warningText: Record<string, string> = {
  missing_client_ids_day_level_outliers_only: "Нет обезличенных ID клиентов: крупные продажи проверены только по дням.",
  insufficient_history_for_annual_seasonality: "Истории недостаточно для годового сезонного профиля.",
  stale_stock_snapshot: "Снимок остатков старше даты расчёта более чем на день.",
  overdue_inbound_excluded: "Просроченные поставки не учтены как будущие поступления.",
  missing_supplier: "Не указан поставщик товара — заказ заблокирован.",
  missing_lead_time: "Не указан срок поставки — заказ заблокирован.",
  missing_sales_history: "Нет истории отгрузок по товару — заказ заблокирован.",
  stockout_without_reference: "Все наблюдения пришлись на отсутствие товара: восстановить спрос не из чего.",
  incomplete_source_sync: "Один из источников отмечен как неполный — заказ заблокирован.",
  horizon_exceeds_730_days: "Срок поставки с периодом пересмотра превышает 730 дней.",
  missing_stock_snapshot: "Нет снимка остатка на дату расчёта — заказ заблокирован.",
  invalid_pack_size: "Некорректная кратность упаковки — заказ заблокирован.",
  incomplete_sources: "В расчёте использованы неполные источники данных.",
};
function warnings(values: string[]): string { return values.map((value) => warningText[value] ?? `Код предупреждения: ${value}`).join(" · "); }

function returnPath(input: string | null): string {
  if (!input || !input.startsWith("/") || input.startsWith("//")) return "/recommendations";
  try {
    const parsed = new URL(input, window.location.origin);
    if (parsed.origin !== window.location.origin || !["/", "/recommendations", "/orders", "/inventory"].includes(parsed.pathname)) return "/recommendations";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return "/recommendations"; }
}

function monthlyHistory(history: SavedRecommendationDetail["details"]["history"]): Point[] {
  const months = new Map<string, Point>();
  for (const row of history) {
    const key = row.date.slice(0, 7);
    const item = months.get(key) ?? { date: key, value: 0, secondary: 0, stockout: false };
    item.value += number(row.raw);
    item.secondary = (item.secondary ?? 0) + number(row.corrected);
    item.stockout ||= row.stockout;
    months.set(key, item);
  }
  return [...months.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function Chart({ points, secondLabel }: { points: Point[]; secondLabel?: string }) {
  if (!points.length) return <p className={styles.muted}>Данных для графика нет.</p>;
  const max = Math.max(1, ...points.map((item) => Math.max(item.value, item.secondary ?? 0)));
  const width = 720, height = 168, left = 22, right = 8, top = 10, bottom = 22;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const y = (value: number) => top + plotHeight * (1 - value / max);
  const path = (key: "value" | "secondary") => points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key] ?? 0).toFixed(1)}`).join(" ");
  return <div className={styles.chartWrap}>
    <div className={styles.legend}><span><i className={styles.rawKey} />{secondLabel ? "Факт продаж" : "Прогноз спроса"}</span>{secondLabel ? <span><i className={styles.correctedKey} />{secondLabel}</span> : null}{points.some((item) => item.stockout) ? <span><i className={styles.stockoutKey} />Был дефицит</span> : null}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={secondLabel ? "Факт и скорректированный спрос по месяцам" : "Прогноз спроса по дням"} preserveAspectRatio="none">
      <line x1={left} y1={top + plotHeight} x2={width - right} y2={top + plotHeight} className={styles.axis} />
      <line x1={left} y1={top + plotHeight / 2} x2={width - right} y2={top + plotHeight / 2} className={styles.grid} />
      {points.map((point, index) => point.stockout ? <circle key={point.date} cx={x(index)} cy={top + plotHeight + 5} r="3" className={styles.stockoutDot} /> : null)}
      <path d={path("value")} className={styles.rawLine} />
      {secondLabel ? <path d={path("secondary")} className={styles.correctedLine} /> : null}
      <text x={left} y={height - 3} className={styles.axisText}>{points[0].date}</text>
      <text x={width - right} y={height - 3} textAnchor="end" className={styles.axisText}>{points.at(-1)?.date}</text>
    </svg>
  </div>;
}

function Skeleton() { return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Загружаем обоснование"><div><i /><i /><i /></div><div><i /><i /><i /><i /></div><div><i /><i /><i /></div></div>; }

export function RecommendationDetailPage() {
  const { recommendationId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [detail, setDetail] = useState<SavedRecommendationDetail | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const back = returnPath(params.get("from"));
  const here = `${location.pathname}${location.search}${location.hash}`;
  const stockPath = `/inventory?${new URLSearchParams({ tab: "stocks", warehouse: detail?.warehouse_id ?? "", product: detail?.product_id ?? "", from: here })}`;
  const productPath = `/data/catalogs?${new URLSearchParams({ tab: "products", id: detail?.product_id ?? "", from: here })}`;
  const history = useMemo(() => monthlyHistory(detail?.details.history ?? []), [detail]);
  const chartHistory = useMemo(() => history.slice(-24), [history]);
  const forecast = useMemo(() => detail?.details.forecast.map((point) => ({ date: point.date, value: number(point.quantity) })) ?? [], [detail]);

  useEffect(() => {
    if (!recommendationId) { setError("Рекомендация не указана."); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null); setDetail(null); setRun(null);
    getRecommendation(recommendationId, controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setDetail(result);
        try { setRun(await getRun(result.run_id, controller.signal)); } catch { /* Основное обоснование доступно без метаданных расчёта. */ }
      })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Не удалось загрузить рекомендацию."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [recommendationId, retry]);

  const breakdown = detail?.details.breakdown;
  const horizon = breakdown?.horizon_days;
  return <div className={styles.page}>
    <PageHeader title={detail?.name ?? "Обоснование заказа"} subtitle={detail ? `${detail.sku} · ${detail.unit} · расчёт на ${date(run?.as_of)}` : "Расчёт по товару"} actions={<Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />} onClick={() => navigate(back, { replace: true })}>{back.startsWith("/orders") ? "К заказу" : "К расчётам"}</Button>} />
    {loading ? <Skeleton /> : error ? <><Alert tone="danger" title="Не удалось открыть рекомендацию">{error}</Alert><Button variant="secondary" icon={<RotateCw size={16} />} onClick={() => setRetry((current) => current + 1)}>Повторить</Button></> : detail && breakdown ? <>
      <Card title="Рекомендация" subtitle="Количество для пополнения склада">
        <div className={styles.hero}><strong>{qty(detail.recommended_quantity)} <small>{detail.unit}</small></strong><Badge tone={detail.status === "blocked" ? "danger" : detail.urgency === "critical" ? "danger" : detail.urgency === "high" ? "warning" : "neutral"}>{detail.status === "blocked" ? "Расчёт заблокирован" : detail.urgency === "critical" ? "Критично" : detail.urgency === "high" ? "Высокая срочность" : detail.urgency === "none" ? "Заказ не нужен" : "Планово"}</Badge></div>
        <p className={styles.summary}>{explanation(detail.explanation)}</p>
        {detail.order_id ? <Alert tone="info" title="Рекомендация уже включена в заказ" action={<Button variant="secondary" size="sm" onClick={() => navigate(`/orders?id=${encodeURIComponent(detail.order_id!)}`)}>Открыть заказ</Button>}>Повторно создать заказ по этой рекомендации нельзя.</Alert> : null}
        <div className={styles.relatedLinks}><Button variant="secondary" size="sm" onClick={() => navigate(stockPath)}>Остатки товара на складе</Button><Button variant="secondary" size="sm" onClick={() => navigate(productPath)}>Карточка товара</Button></div>
        <div className={styles.facts}><span>Срок поставки: <b>{display(breakdown.lead_time_days)} дн.</b></span><span>Горизонт: <b>{display(horizon)} дн.</b></span><span>Дефицит ожидается: <b>{date(String(breakdown.shortage_date ?? ""))}</b></span><span>Дата расчёта: <b>{date(run?.as_of)}</b></span></div>
      </Card>

      {detail.details.warnings.length ? <Alert tone="warning" title="Замечания к расчёту">{warnings(detail.details.warnings)}</Alert> : null}

      <Card title="Как получено количество" subtitle="Прогноз и страховой запас за вычетом остатка и поставок в пути; затем округление">
        <div className={styles.formula}>{fields.map(([key, label]) => <div key={key} className={key === "recommended_quantity" ? styles.total : undefined}><span>{label}</span><strong>{display(breakdown[key])} {detail.unit}</strong></div>)}</div>
        <p className={styles.muted}>Сезонность: {breakdown.seasonality_method === "product_monthly" ? "помесячная по товару" : breakdown.seasonality_method === "category_monthly" ? "помесячная по категории" : breakdown.seasonality_method === "flat_short_history" ? "короткая история, без сезонного профиля" : display(breakdown.seasonality_method)}. Базовый спрос: {display(breakdown.baseline_daily)} {detail.unit}/день. Тренд: {display(breakdown.trend_daily_slope)} {detail.unit}/день. Страховой запас: {display(breakdown.safety_days)} дн.</p>
      </Card>

      <div className={styles.twoColumns}>
        <Card title="История спроса" subtitle={`Фактические продажи и скорректированный спрос · ${detail.details.history.length} дн. за ${history.length} мес.`}>
          <Chart points={chartHistory} secondLabel="Спрос после корректировок" />
          {history.length > chartHistory.length ? <p className={styles.muted}>На графике последние {chartHistory.length} из {history.length} мес.; таблица ниже содержит всю историю.</p> : null}
          <div className={styles.facts}><span>Продано: <b>{display(breakdown.raw_sales)} {detail.unit}</b></span><span>После корректировок: <b>{display(breakdown.corrected_sales)} {detail.unit}</b></span><span>Оценка упущенного спроса: <b>{display(breakdown.lost_demand)} {detail.unit}</b></span><span>Дней с подтверждённым отсутствием: <b>{detail.details.history.filter((point) => point.stockout).length}</b></span></div>
          <p className={styles.muted}>Отсутствие отмечается только для загруженных подтверждённых периодов; ноль не доказывает, что дефицита не было.</p>
          <details className={styles.disclosure}><summary>Показать месяцы</summary><Table><thead><Tr><Th>Месяц</Th><Th numeric>Продажи</Th><Th numeric>Спрос</Th><Th>Дефицит</Th></Tr></thead><tbody>{history.map((point) => <Tr key={point.date}><Td>{point.date}</Td><Td numeric>{qty(point.value)}</Td><Td numeric>{qty(point.secondary)}</Td><Td>{point.stockout ? "Отмечен" : "Не отмечен"}</Td></Tr>)}</tbody></Table></details>
        </Card>
        <Card title="Прогноз" subtitle={`Дневной спрос на горизонт расчёта · ${detail.details.forecast.length} дн.`}>
          <Chart points={forecast} />
          <div className={styles.facts}><span>За горизонт: <b>{display(breakdown.forecast_quantity)} {detail.unit}</b></span><span>Сезонность и тренд показаны, если их удалось оценить по истории</span></div>
          <details className={styles.disclosure}><summary>Показать прогноз по дням</summary><div className={styles.scrollTable}><Table><thead><Tr><Th>Дата</Th><Th numeric>Спрос</Th><Th numeric>Сезонность</Th><Th numeric>Прирост</Th><Th numeric>Темп роста</Th></Tr></thead><tbody>{detail.details.forecast.map((point) => <Tr key={point.date}><Td>{date(point.date)}</Td><Td numeric>{qty(point.quantity)}</Td><Td numeric>{display(point.seasonal_factor)}</Td><Td numeric>{display(point.trend_increment)}</Td><Td numeric>{display(point.growth_rate)}</Td></Tr>)}</tbody></Table></div></details>
        </Card>
      </div>

      <Card title="Разовые крупные продажи" subtitle={`Исключены из регулярного спроса · ${detail.details.excluded_sales.length}`}>
        {detail.details.excluded_sales.length ? <><p className={styles.muted}>Всего исключено: {display(breakdown.excluded_quantity)} {detail.unit}. ID клиентов обезличены, когда они переданы источником.</p><div className={styles.scrollTable}><Table><thead><Tr><Th>Дата</Th><Th>Клиент</Th><Th numeric>Продано</Th><Th numeric>Порог</Th><Th>Причина</Th></Tr></thead><tbody>{detail.details.excluded_sales.map((sale, index) => <Tr key={`${sale.date}-${index}`}><Td>{date(sale.date)}</Td><Td>{sale.client_id ?? "—"}</Td><Td numeric>{qty(sale.quantity)}</Td><Td numeric>{qty(sale.threshold)}</Td><Td>{sale.reason}</Td></Tr>)}</tbody></Table></div></> : <EmptyState title="Исключённых продаж нет" text="Алгоритм не отметил разовые крупные продажи в доступной истории. Без ID клиентов проверка ограничена дневными объёмами." />}
      </Card>

      <Card title="Товары в пути" subtitle={`Учтены в потребности · ${detail.details.inbound.length}`}>
        {detail.details.inbound.length ? <div className={styles.scrollTable}><Table><thead><Tr><Th>Ожидаемая дата</Th><Th numeric>Количество</Th><Th>Статус</Th></Tr></thead><tbody>{detail.details.inbound.map((item, index) => <Tr key={`${item.expected_date}-${index}`}><Td>{date(item.expected_date)}</Td><Td numeric>{qty(item.quantity)} {detail.unit}</Td><Td>{inboundStatus(item.status)}</Td></Tr>)}</tbody></Table></div> : <p className={styles.muted}>Поступлений в пути нет.</p>}
      </Card>
      {run ? <Card title="Данные расчёта" subtitle={`Версия алгоритма ${run.algorithm_version}`}><div className={styles.facts}>{run.source_versions.map((source) => <span key={source.source_id}>Источник {source.source_id}: <b>версия {source.revision}</b>{source.complete ? "" : " · не полон"}</span>)}</div>{run.warnings.length ? <p className={styles.muted}>{warnings(run.warnings)}</p> : null}</Card> : null}
    </> : <EmptyState title="Обоснование недоступно" text="Попробуйте открыть рекомендацию ещё раз из списка расчётов." />}
  </div>;
}
