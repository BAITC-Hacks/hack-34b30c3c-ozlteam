import { ArrowLeft, RotateCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { Alert, Badge, Button, Card, EmptyState, Table, Td, Th, Tr } from "../../../shared/ui";
import { getRecommendation, getRun } from "../api/runs";
import type { Run, SavedRecommendationDetail } from "../runTypes";
import styles from "./RecommendationDetailPage.module.css";
import { breakdownQuantity, breakdownValue, describeWarnings, formatQuantity } from "../lib/presentation";

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
function date(value: string | null | undefined, locale = "ru"): string { return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU") : "—"; }
function display(value: number | string | null | undefined): string { return value == null || value === "" ? "—" : /^-?\d+(\.\d+)?$/.test(String(value)) ? qty(value) : String(value); }

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
  const { t } = useI18n();
  if (!points.length) return <p className={styles.muted}>{t('Данных для графика нет.', 'Графикке дерек жоқ.', 'No chart data.')}</p>;
  const max = Math.max(1, ...points.map((item) => Math.max(item.value, item.secondary ?? 0)));
  const width = 720, height = 168, left = 22, right = 8, top = 10, bottom = 22;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (index: number) => left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
  const y = (value: number) => top + plotHeight * (1 - value / max);
  const path = (key: "value" | "secondary") => points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point[key] ?? 0).toFixed(1)}`).join(" ");
  return <div className={styles.chartWrap}>
    <div className={styles.legend}><span><i className={styles.rawKey} />{secondLabel ? t('Факт продаж', 'Нақты сатылымдар', 'Actual sales') : t('Прогноз спроса', 'Сұраныс болжамы', 'Demand forecast')}</span>{secondLabel ? <span><i className={styles.correctedKey} />{secondLabel}</span> : null}{points.some((item) => item.stockout) ? <span><i className={styles.stockoutKey} />{t('Был дефицит', 'Тапшылық болды', 'Stockout occurred')}</span> : null}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={secondLabel ? t('Факт и скорректированный спрос по месяцам', 'Айлық нақты және түзетілген сұраныс', 'Monthly actual and adjusted demand') : t('Прогноз спроса по дням', 'Күндік сұраныс болжамы', 'Daily demand forecast')} preserveAspectRatio="none">
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
  const { t, locale } = useI18n();
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
  return <div className={styles.page}>
    <PageHeader title={detail?.name ?? t('Обоснование заказа', 'Тапсырыс негіздемесі', 'Order rationale')} subtitle={detail ? `${detail.sku} · ${detail.unit} · ${t("расчёт на", "есептеу күні", "calculated for")} ${date(run?.as_of, locale)}` : t('Расчёт по товару', 'Тауар бойынша есеп', 'Product calculation')} actions={<Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />} onClick={() => navigate(back, { replace: true })}>{back.startsWith("/orders") ? t('К заказу', 'Тапсырысқа', 'To order') : t('К расчётам', 'Есептерге', 'To runs')}</Button>} />
    {loading ? <Skeleton /> : error ? <><Alert tone="danger" title={t('Не удалось открыть рекомендацию', 'Ұсыным ашылмады', 'Could not open recommendation')}>{error}</Alert><Button variant="secondary" icon={<RotateCw size={16} />} onClick={() => setRetry((current) => current + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</Button></> : detail && breakdown ? <>
      <Card title={t('Рекомендация', 'Ұсыным', 'Recommendation')} subtitle={t('Количество для пополнения склада', 'Қойманы толықтыру саны', 'Quantity to replenish')}>
        <div className={styles.hero}><strong>{detail.status === "blocked" ? "—" : formatQuantity(detail.recommended_quantity)} {detail.status !== "blocked" ? <small>{detail.unit}</small> : null}</strong><Badge tone={detail.status === "blocked" ? "danger" : detail.urgency === "critical" ? "danger" : detail.urgency === "high" ? "warning" : "neutral"}>{detail.status === "blocked" ? t('Недостаточно данных', 'Дерек жеткіліксіз', 'Insufficient data') : detail.urgency === "critical" ? t('Критично', 'Өте шұғыл', 'Critical') : detail.urgency === "high" ? t('Высокая срочность', 'Жоғары шұғылдық', 'High urgency') : detail.urgency === "none" ? t('Заказ не нужен', 'Тапсырыс қажет емес', 'No order needed') : t('Планово', 'Жоспарлы', 'Planned')}</Badge></div>
        <p className={styles.summary}>{detail.explanation}</p>
        {detail.order_id ? <Alert tone="info" title={t('Рекомендация уже включена в заказ', 'Ұсыным тапсырысқа қосылған', 'Recommendation already in an order')} action={<Button variant="secondary" size="sm" onClick={() => navigate(`/orders?id=${encodeURIComponent(detail.order_id!)}`)}>{t('Открыть заказ', 'Тапсырысты ашу', 'Open order')}</Button>}>{t('Повторно создать заказ по этой рекомендации нельзя.', 'Бұл ұсыным бойынша тапсырысты қайта жасауға болмайды.', 'An order cannot be created again from this recommendation.')}</Alert> : null}
        <div className={styles.relatedLinks}><Button variant="secondary" size="sm" onClick={() => navigate(stockPath)}>{t('Остатки товара на складе', 'Қоймадағы тауар қалдығы', 'Product stock')}</Button><Button variant="secondary" size="sm" onClick={() => navigate(productPath)}>{t('Карточка товара', 'Тауар картасы', 'Product details')}</Button></div>
        <div className={styles.facts}><span>{t("Срок поставки, дней:", "Жеткізу мерзімі, күн:", "Lead time, days:")} <b>{breakdownValue(detail, "lead_time_days", t)}</b></span><span>{t("Горизонт, дней:", "Кезең, күн:", "Horizon, days:")} <b>{breakdownValue(detail, "horizon_days", t)}</b></span><span>{t("Дефицит ожидается:", "Тапшылық күтіледі:", "Stockout expected:")} <b>{detail.status === "blocked" ? t('Не определён', 'Анықталмаған', 'Not determined') : date(String(breakdown.shortage_date ?? ""), locale)}</b></span><span>{t("Дата расчёта:", "Есептеу күні:", "Calculation date:")} <b>{date(run?.as_of, locale)}</b></span></div>
      </Card>

      {detail.details.warnings.length ? <Alert tone="warning" title={t('Ограничения и следующие действия', 'Шектеулер мен келесі қадамдар', 'Limitations and next steps')}>{describeWarnings(detail.details.warnings, t)}</Alert> : null}

      <Card title={detail.status === "blocked" ? t('Промежуточный расчёт', 'Аралық есеп', 'Provisional calculation') : t('Как получено количество', 'Саны қалай есептелді', 'How quantity was calculated')} subtitle={t('Прогноз и страховой запас за вычетом остатка и поставок в пути; затем округление', 'Болжам мен сақтандыру қоры минус қалдық пен жолдағы жеткізілімдер; содан кейін дөңгелектеу', 'Forecast plus safety stock minus available stock and inbound deliveries, then rounding')}>
        {detail.status === "blocked" ? <Alert tone="info">{t("Промежуточный результат:", "Аралық нәтиже:", "Provisional result:")} {formatQuantity(detail.recommended_quantity)} {detail.unit}. {t("Он получен при неполных данных и не является количеством к заказу. После исправления данных запустите новый расчёт.", "Ол толық емес деректерден алынған, сондықтан тапсырыс саны емес. Деректерді түзеткен соң жаңа есепті бастаңыз.", "It uses incomplete data and is not an order quantity. Run a new calculation after fixing the data.")}</Alert> : null}
        <div className={styles.formula}>{fields.map(([key, label]) => <div key={key} className={key === "recommended_quantity" ? styles.total : undefined}><span>{label}</span><strong>{breakdownQuantity(detail, key, t)}</strong></div>)}</div>
        <p className={styles.muted}>{t("≈ — значение округлено для чтения. Количество заказа и исходные данные не изменены.", "≈ — мән оқуға ыңғайлы болу үшін дөңгелектенген. Тапсырыс саны мен бастапқы деректер өзгермеді.", "≈ indicates a rounded display value. Order quantity and source data are unchanged.")}</p>
        <p className={styles.muted}>Сезонность: {breakdownValue(detail, "seasonality_method", t)}. Базовый спрос: {breakdownValue(detail, "baseline_daily", t)}. Тренд: {breakdownValue(detail, "trend_daily_slope", t)} ({detail.unit}/день). Страховой запас: {display(breakdown.safety_days)} дн.</p>
        <details className={styles.disclosure}><summary>{t('Точные значения промежуточных вычислений', 'Аралық есептің нақты мәндері', 'Exact intermediate values')}</summary><p className={styles.muted}>{t('Сохранены для проверки арифметики. При неполных данных не подтверждают количество заказа.', 'Арифметиканы тексеру үшін сақталған. Деректер толық болмаса, тапсырыс санын растамайды.', 'Saved to verify arithmetic. With incomplete data they do not confirm an order quantity.')}</p><dl>{fields.filter(([key]) => ["forecast_quantity", "safety_stock", "unrounded_quantity", "rounding_increment"].includes(key)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{formatQuantity(breakdown[key])} {detail.unit}</dd></div>)}</dl></details>
      </Card>

      <div className={styles.twoColumns}>
        <Card title={t('История спроса', 'Сұраныс тарихы', 'Demand history')} subtitle={`Фактические продажи и скорректированный спрос · ${detail.details.history.length} дн. за ${history.length} мес.`}>
          <Chart points={chartHistory} secondLabel={t('Спрос после корректировок', 'Түзетілген сұраныс', 'Adjusted demand')} />
          {history.length > chartHistory.length ? <p className={styles.muted}>На графике последние {chartHistory.length} из {history.length} мес.; таблица ниже содержит всю историю.</p> : null}
          <div className={styles.facts}><span>Продано: <b>{breakdownQuantity(detail, "raw_sales", t)}</b></span><span>После корректировок: <b>{breakdownQuantity(detail, "corrected_sales", t)}</b></span><span>Оценка упущенного спроса: <b>{breakdownQuantity(detail, "lost_demand", t)}</b></span><span>Дней с подтверждённым отсутствием: <b>{detail.details.history.filter((point) => point.stockout).length}</b></span></div>
          <p className={styles.muted}>{t("Отсутствие отмечается только для загруженных подтверждённых периодов; ноль не доказывает, что дефицита не было.", "Тапшылық тек жүктелген, расталған кезеңдерде белгіленеді; нөл тапшылық болмағанын дәлелдемейді.", "Stockouts are shown only for imported confirmed periods; zero does not prove there was no shortage.")}</p>
          <details className={styles.disclosure}><summary>{t('Показать месяцы', 'Айларды көрсету', 'Show months')}</summary><Table><thead><Tr><Th>{t('Месяц', 'Ай', 'Month')}</Th><Th numeric>{t('Продажи', 'Сатылымдар', 'Sales')}</Th><Th numeric>{t('Спрос', 'Сұраныс', 'Demand')}</Th><Th>{t('Дефицит', 'Тапшылық', 'Stockout')}</Th></Tr></thead><tbody>{history.map((point) => <Tr key={point.date}><Td>{point.date}</Td><Td numeric>{qty(point.value)}</Td><Td numeric>{qty(point.secondary)}</Td><Td>{point.stockout ? t('Отмечен', 'Белгіленген', 'Recorded') : t('Не отмечен', 'Белгіленбеген', 'Not recorded')}</Td></Tr>)}</tbody></Table></details>
        </Card>
        <Card title={t('Прогноз', 'Болжам', 'Forecast')} subtitle={`Дневной спрос на горизонт расчёта · ${detail.details.forecast.length} дн.`}>
          <Chart points={forecast} />
          <div className={styles.facts}><span>За горизонт: <b>{breakdownQuantity(detail, "forecast_quantity", t)}</b></span><span>{t("Сезонность и тренд показаны, если их удалось оценить по истории", "Маусымдылық пен тренд тарих негізінде бағаланса ғана көрсетіледі", "Seasonality and trend are shown when history supports an estimate")}</span></div>
          <details className={styles.disclosure}><summary>{t('Показать прогноз по дням', 'Күндік болжамды көрсету', 'Show daily forecast')}</summary><div className={styles.scrollTable}><Table><thead><Tr><Th>{t('Дата', 'Күні', 'Date')}</Th><Th numeric>{t('Спрос', 'Сұраныс', 'Demand')}</Th><Th numeric>{t('Сезонность', 'Маусымдылық', 'Seasonality')}</Th><Th numeric>{t('Прирост', 'Өсім', 'Growth')}</Th><Th numeric>{t('Темп роста', 'Өсу қарқыны', 'Growth rate')}</Th></Tr></thead><tbody>{detail.details.forecast.map((point) => <Tr key={point.date}><Td>{date(point.date, locale)}</Td><Td numeric>{qty(point.quantity)}</Td><Td numeric>{display(point.seasonal_factor)}</Td><Td numeric>{display(point.trend_increment)}</Td><Td numeric>{display(point.growth_rate)}</Td></Tr>)}</tbody></Table></div></details>
        </Card>
      </div>

      <Card title={t('Разовые крупные продажи', 'Бір реттік ірі сатылымдар', 'One-off large sales')} subtitle={`Исключены из регулярного спроса · ${detail.details.excluded_sales.length}`}>
        {detail.details.excluded_sales.length ? <><p className={styles.muted}>{t("Всего исключено:", "Барлығы алынып тасталды:", "Total excluded:")} {display(breakdown.excluded_quantity)} {detail.unit}. {t("ID клиентов обезличены, когда они переданы источником.", "Дереккөз берген клиент ID-лері жасырындандырылған.", "Customer IDs are anonymized when provided by the source.")}</p><div className={styles.scrollTable}><Table><thead><Tr><Th>{t('Дата', 'Күні', 'Date')}</Th><Th>{t('Клиент', 'Клиент', 'Customer')}</Th><Th numeric>{t('Продано', 'Сатылды', 'Sold')}</Th><Th numeric>{t('Порог', 'Шек', 'Threshold')}</Th><Th>{t('Причина', 'Себебі', 'Reason')}</Th></Tr></thead><tbody>{detail.details.excluded_sales.map((sale, index) => <Tr key={`${sale.date}-${index}`}><Td>{date(sale.date, locale)}</Td><Td>{sale.client_id ?? "—"}</Td><Td numeric>{qty(sale.quantity)}</Td><Td numeric>{qty(sale.threshold)}</Td><Td>{sale.reason}</Td></Tr>)}</tbody></Table></div></> : <EmptyState title={t('Исключённых продаж нет', 'Алып тасталған сатылым жоқ', 'No excluded sales')} text={t('Алгоритм не отметил разовые крупные продажи в доступной истории. Без ID клиентов проверка ограничена дневными объёмами.', 'Алгоритм қолда бар тарихтан бір реттік ірі сатылымдарды таппады. Клиент ID болмаса, тексеру күндік көлеммен шектеледі.', 'The algorithm found no one-off large sales in the available history. Without customer IDs, checks are limited to daily totals.')} />}
      </Card>

      <Card title={t('Товары в пути', 'Жолдағы тауарлар', 'Inbound goods')} subtitle={`Учтены в потребности · ${detail.details.inbound.length}`}>
        {detail.details.inbound.length ? <div className={styles.scrollTable}><Table><thead><Tr><Th>{t('Ожидаемая дата', 'Күтілетін күн', 'Expected date')}</Th><Th numeric>{t('Количество', 'Саны', 'Quantity')}</Th><Th>{t('Статус', 'Мәртебе', 'Status')}</Th></Tr></thead><tbody>{detail.details.inbound.map((item, index) => <Tr key={`${item.expected_date}-${index}`}><Td>{date(item.expected_date, locale)}</Td><Td numeric>{qty(item.quantity)} {detail.unit}</Td><Td>{({ in_transit: t("В пути", "Жолда", "In transit"), confirmed: t("Подтверждено", "Расталған", "Confirmed"), planned: t("Запланировано", "Жоспарланған", "Planned"), received: t("Получено", "Алынған", "Received") } as Record<string, string>)[item.status] ?? item.status}</Td></Tr>)}</tbody></Table></div> : <p className={styles.muted}>{t('Поступлений в пути нет.', 'Жолдағы жеткізілімдер жоқ.', 'No inbound deliveries.')}</p>}
      </Card>
      {run ? <Card title={t('Данные расчёта', 'Есеп деректері', 'Run data')} subtitle={`Версия алгоритма ${run.algorithm_version}`}><div className={styles.facts}>{run.source_versions.map((source) => <span key={source.source_id}>Источник {source.source_id}: <b>версия {source.revision}</b>{source.complete ? "" : " · не полон"}</span>)}</div>{run.warnings.length ? <p className={styles.muted}>{describeWarnings(run.warnings, t)}</p> : null}</Card> : null}
    </> : <EmptyState title={t('Обоснование недоступно', 'Негіздеме қолжетімсіз', 'Rationale unavailable')} text={t('Попробуйте открыть рекомендацию ещё раз из списка расчётов.', 'Ұсынымды есептер тізімінен қайта ашып көріңіз.', 'Try opening the recommendation again from the run list.')} />}
  </div>;
}
