import { ArrowRight, Check, ClipboardList, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Modal, Select, Table, Td, Th, Tile, Tr } from "../../../shared/ui";
import { ApiError } from "../../../shared/api/client";
import { createOrders, createRun, getCatalog, getJob, getOverview, getRecommendation, getRecommendations, getRun, getRuns } from "../api/runs";
import type { CatalogOption, CreatedOrder, JobStatus, ReplenishmentOverview, Run, SavedRecommendation, SavedRecommendationDetail, SavedRecommendationPage } from "../runTypes";
import styles from "./RunsPage.module.css";
import { breakdownValue, describeWarnings } from "../lib/presentation";

const urgency = {
  none: { label: "Без заказа", tone: "neutral" },
  normal: { label: "Планово", tone: "neutral" },
  high: { label: "Высокий", tone: "warning" },
  critical: { label: "Критично", tone: "danger" },
} as const;

const historyLimit = 30;
const orderAttemptStorage = "hackalem.order-attempt";
const runAttemptStorage = "hackalem.run-attempt";

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "У вашей роли нет права на это действие. Войдите как закупщик или администратор.";
  return error instanceof Error ? error.message : "Не удалось выполнить действие.";
}

function quantity(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction && Number(fraction) ? `${grouped},${fraction.replace(/0+$/, "")}` : grouped;
}

function sumQuantities(values: string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split(".")[1]?.length ?? 0));
  const unit = 10n ** BigInt(scale);
  const sum = values.reduce((total, value) => {
    const [whole, fraction = ""] = value.split(".");
    return total + BigInt(whole) * unit + BigInt((fraction.padEnd(scale, "0") || "0"));
  }, 0n);
  const whole = sum / unit;
  const fraction = (sum % unit).toString().padStart(scale, "0").replace(/0+$/, "");
  return quantity(fraction ? `${whole}.${fraction}` : String(whole));
}

function isOrderable(row: SavedRecommendation): boolean {
  return row.order_id === null && row.status === "ready" && row.supplier_id !== null && Number(row.recommended_quantity) > 0;
}

function runLabel(run: Run, t: ReturnType<typeof useI18n>["t"]): string {
  return `${run.as_of} · ${run.status === "done" ? t("готов", "дайын", "done") : run.status === "failed" ? t("ошибка", "қате", "failed") : t("считается", "есептелуде", "running")}`;
}

function RunSkeleton() {
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Загружаем расчёты">
    <div className={styles.skeletonCard}><i /><i /><i /></div>
    <div className={styles.skeletonCard}><i /><i /><i /><i /></div>
  </div>;
}

export function RunsPage() {
  const { t } = useI18n();
  const breakdownLabels: Record<string, string> = { raw_sales: t('Продажи', 'Сатылымдар', 'Sales'), corrected_sales: t('Спрос после корректировок', 'Түзетілген сұраныс', 'Adjusted demand'), excluded_quantity: t('Исключённый выброс', 'Алып тасталған шарықтау', 'Excluded spike'), lost_demand: t('Упущенный спрос', 'Өткізіп алған сұраныс', 'Lost demand'), baseline_daily: t('Базовый спрос в день', 'Күндік негізгі сұраныс', 'Baseline daily demand'), forecast_quantity: t('Прогноз на горизонт', 'Кезеңге болжам', 'Forecast for horizon'), safety_stock: t('Страховой запас', 'Сақтандыру қоры', 'Safety stock'), available_stock: t('Доступный остаток', 'Қолжетімді қалдық', 'Available stock'), inbound_quantity: t('Мерзімінде келетін тауар', 'Мерзімінде келетін тауар', 'Inbound on time'), unrounded_quantity: t('До округления', 'Дөңгелектеуге дейін', 'Before rounding'), rounding_increment: t('Добавлено округлением', 'Дөңгелектеумен қосылды', 'Rounding increment'), recommended_quantity: t('К заказу', 'Тапсырысқа', 'To order'), lead_time_days: t('Срок поставки, дней', 'Жеткізу мерзімі, күн', 'Lead time, days'), review_days: t('Период пересмотра, дней', 'Қайта қарау кезеңі, күн', 'Review period, days'), horizon_days: t('Горизонт, дней', 'Кезең, күн', 'Horizon, days'), safety_days: t('Дни страхового запаса', 'Сақтандыру қорының күндері', 'Safety stock days'), seasonality_method: t('Метод сезонности', 'Маусымдылық әдісі', 'Seasonality method'), shortage_date: t('Дата дефицита', 'Тапшылық күні', 'Stockout date'), excess_quantity: t('Избыток', 'Артық қор', 'Excess'), trend_daily_slope: t('Рост в день', 'Күндік өсім', 'Daily growth') };
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [suppliers, setSuppliers] = useState<CatalogOption[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsLoadedKey, setRunsLoadedKey] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runRetry, setRunRetry] = useState(0);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [overview, setOverview] = useState<ReplenishmentOverview | null>(null);
  const [page, setPage] = useState<SavedRecommendationPage | null>(null);
  const [pageLoadedKey, setPageLoadedKey] = useState("");
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationsRetry, setRecommendationsRetry] = useState(0);
  const [detail, setDetail] = useState<SavedRecommendationDetail | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<"run" | "orders" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [today, setToday] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [asOf, setAsOf] = useState(today);
  const [historyDays, setHistoryDays] = useState(1095);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [conflictIds, setConflictIds] = useState<string[]>([]);
  const [createdOrders, setCreatedOrders] = useState<CreatedOrder[]>([]);
  const orderAttempt = useRef<{ signature: string; key: string } | null>(null);
  const runAttempt = useRef<{ signature: string; key: string } | null>(null);
  const activeRunId = useRef<string | null>(null);

  const historyOffset = Math.max(0, Math.floor(Number(params.get("history_offset") || "0") || 0));
  const warehouseFilter = params.get("warehouse") ?? "";
  const historyKey = `${warehouseFilter}:${historyOffset}`;
  const visibleRuns = runsLoadedKey === historyKey ? runs : [];
  const runId = params.get("run") ?? visibleRuns[0]?.id ?? null;
  const recommendationId = params.get("recommendation");
  const offset = Math.max(0, Math.floor(Number(params.get("offset") || "0") || 0));
  const urgencyFilter = params.get("urgency") ?? "";
  const supplierFilter = params.get("supplier") ?? "";
  const pageKey = `${runId ?? ""}:${offset}:${urgencyFilter}:${supplierFilter}`;
  const visiblePage = pageLoadedKey === pageKey ? page : null;
  const selectedOrderableCount = visiblePage?.items.filter((row) => selected.has(row.id) && isOrderable(row)).length ?? 0;
  const selectedRows = visiblePage?.items.filter((row) => selected.has(row.id) && isOrderable(row)) ?? [];
  const selectedUnits = [...selectedRows.reduce((map, row) => map.set(row.unit, [...(map.get(row.unit) ?? []), row.recommended_quantity]), new Map<string, string[]>())];
  const conflictOrders = visiblePage?.items.filter((row) => conflictIds.includes(row.id) && row.order_id) ?? [];
  const supplierNames = useMemo(() => new Map(suppliers.map((item) => [item.id, item.name])), [suppliers]);
  const validHistoryDays = Number.isInteger(historyDays) && historyDays >= 28 && historyDays <= 3650;

  function updateParams(changes: Record<string, string | null>) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  }

  useEffect(() => {
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(() => {
      const nextToday = new Date().toLocaleDateString("en-CA");
      setAsOf((current) => current === today ? nextToday : current);
      setToday(nextToday);
    }, nextMidnight.getTime() - Date.now() + 100);
    return () => clearTimeout(timer);
  }, [today]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getCatalog("warehouses", controller.signal), getCatalog("categories", controller.signal), getCatalog("suppliers", controller.signal)])
      .then(([nextWarehouses, nextCategories, nextSuppliers]) => {
        setWarehouses(nextWarehouses);
        setCategories(nextCategories);
        setSuppliers(nextSuppliers);
        setWarehouseId((current) => current || (nextWarehouses.some((item) => item.id === warehouseFilter) ? warehouseFilter : nextWarehouses[0]?.id) || "");
      })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getOverview(warehouseId, controller.signal)
      .then(setOverview)
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); });
    return () => controller.abort();
  }, [warehouseId]);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(null);
    getRuns(historyOffset, controller.signal, warehouseFilter)
      .then((next) => { setRuns(next.items); setRunsTotal(next.total); setRunsLoadedKey(historyKey); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setHistoryError(errorText(caught)); });
    return () => controller.abort();
  }, [historyKey, historyOffset, historyRetry, warehouseFilter]);

  useEffect(() => {
    if (activeRunId.current !== runId) {
      setSelected(new Set());
      setPage(null);
      setJob(null);
      setRun(null);
      activeRunId.current = runId;
    }
    setRunError(null);
    if (!runId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const next = await getRun(runId!, controller.signal);
        if (controller.signal.aborted) return;
        setRun(next);
        setRunError(null);
        setRuns((current) => current.map((item) => item.id === next.id ? next : item));
        if (next.job_id && (next.status === "queued" || next.status === "running")) {
          getJob(next.job_id, controller.signal).then(setJob).catch(() => undefined);
          timer = setTimeout(() => void refresh(), 1500);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setRunError(errorText(caught));
        if (!(caught instanceof ApiError && [401, 403, 404].includes(caught.status))) {
          timer = setTimeout(() => void refresh(), 3000);
        }
      }
    }
    void refresh();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [runId, runRetry]);

  useEffect(() => {
    if (!runId || run?.id !== runId || run.status !== "done") return;
    const controller = new AbortController();
    setRecommendationsError(null);
    setLoadingRows(true);
    getRecommendations(runId, offset, urgencyFilter, supplierFilter, controller.signal)
      .then((next) => { setPage(next); setPageLoadedKey(pageKey); setSelected((current) => new Set([...current].filter((id) => next.items.some((row) => row.id === id && isOrderable(row))))); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setRecommendationsError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingRows(false); });
    return () => controller.abort();
  }, [runId, run?.id, run?.status, offset, urgencyFilter, supplierFilter, pageKey, recommendationsRetry]);

  useEffect(() => { setSelected(new Set()); setPreviewOpen(false); setOrderError(null); setConflictIds([]); }, [runId, urgencyFilter, supplierFilter, offset]);

  useEffect(() => {
    if (!recommendationId) { setDetail(null); return; }
    const controller = new AbortController();
    setDetail(null);
    setLoadingDetail(true);
    getRecommendation(recommendationId, controller.signal)
      .then(setDetail)
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDetail(false); });
    return () => controller.abort();
  }, [recommendationId]);

  async function startRun() {
    if (!warehouseId || !validHistoryDays) return;
    const signature = `${warehouseId}:${categoryId}:${asOf}:${historyDays}`;
    let attempt = runAttempt.current;
    if (!attempt || attempt.signature !== signature) {
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(runAttemptStorage) ?? "null");
        if (saved && typeof saved === "object" && "signature" in saved && "key" in saved && saved.signature === signature && typeof saved.key === "string") attempt = { signature, key: saved.key };
      } catch { /* Ключ остаётся в памяти вкладки. */ }
      if (!attempt || attempt.signature !== signature) attempt = { signature, key: crypto.randomUUID() };
      runAttempt.current = attempt;
      try { sessionStorage.setItem(runAttemptStorage, JSON.stringify(attempt)); } catch { /* Хранилище недоступно. */ }
    }
    setBusy("run");
    setError(null);
    try {
      const next = await createRun({ warehouse_id: warehouseId, category_id: categoryId || null, as_of: asOf, idempotency_key: attempt.key, parameters: { history_days: historyDays } });
      runAttempt.current = null;
      try { sessionStorage.removeItem(runAttemptStorage); } catch { /* Хранилище недоступно. */ }
      setCreatedOrders([]);
      setRunsLoadedKey(null);
      setHistoryRetry((current) => current + 1);
      updateParams({ history_offset: null, run: next.id, recommendation: null, offset: null, urgency: null, supplier: null });
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  }

  async function submitOrders() {
    if (!selectedOrderableCount || !visiblePage || loadingRows) return;
    const ids = visiblePage.items.filter((row) => selected.has(row.id) && isOrderable(row)).map((row) => row.id).sort();
    if (!ids.length) return;
    const signature = ids.join(",");
    let attempt = orderAttempt.current;
    if (!attempt || attempt.signature !== signature) {
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(orderAttemptStorage) ?? "null");
        if (saved && typeof saved === "object" && "signature" in saved && "key" in saved && saved.signature === signature && typeof saved.key === "string") attempt = { signature, key: saved.key };
      } catch { /* Браузер может запретить sessionStorage. */ }
      if (!attempt || attempt.signature !== signature) attempt = { signature, key: crypto.randomUUID() };
      orderAttempt.current = attempt;
      try { sessionStorage.setItem(orderAttemptStorage, JSON.stringify(attempt)); } catch { /* Ключ остаётся в памяти вкладки. */ }
    }
    setBusy("orders");
    setOrderError(null);
    try {
      const orders = await createOrders(ids, attempt.key);
      orderAttempt.current = null;
      try { sessionStorage.removeItem(orderAttemptStorage); } catch { /* Хранилище недоступно. */ }
      setPreviewOpen(false);
      setConflictIds([]);
      setSelected(new Set());
      setCreatedOrders(orders);
      setRecommendationsRetry((current) => current + 1);
      getOverview(warehouseId).then(setOverview).catch(() => undefined);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setOrderError("Не удалось создать заказ: часть рекомендаций уже включена в заказ или данные изменились. Список обновляется; проверьте выбор.");
        setConflictIds(ids);
        orderAttempt.current = null;
        try { sessionStorage.removeItem(orderAttemptStorage); } catch { /* Хранилище недоступно. */ }
        setRecommendationsRetry((current) => current + 1);
      } else setOrderError(errorText(caught));
    }
    finally { setBusy(null); }
  }

  const rows = visiblePage?.items ?? [];
  const grouped = useMemo(() => {
    const groups = new Map<string, SavedRecommendation[]>();
    for (const row of rows) {
      const key = row.supplier_id ?? "none";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()];
  }, [rows]);

  function toggleSupplierPage(rowsForSupplier: SavedRecommendation[]) {
    const available = rowsForSupplier.filter(isOrderable).map((row) => row.id);
    setSelected((current) => {
      const next = new Set(current);
      if (available.every((id) => next.has(id))) available.forEach((id) => next.delete(id));
      else available.forEach((id) => next.add(id));
      return next;
    });
  }

  return <div className={styles.page}>
    <PageHeader title={t('Расчёты пополнения', 'Толықтыру есептері', 'Replenishment runs')} subtitle={t('Сохранённые рекомендации по товарам и складам', 'Тауарлар мен қоймалар бойынша сақталған ұсынымдар', 'Saved recommendations by product and warehouse')} actions={<Button variant="secondary" size="sm" icon={<ClipboardList size={15} strokeWidth={1.8} />} onClick={() => navigate("/recommendations/demo")}>{t('Открыть демо', 'Демоны ашу', 'Open demo')}</Button>} />

    {error ? <Alert tone="danger" title={t('Не удалось выполнить действие', 'Әрекет орындалмады', 'Action failed')}>{error}</Alert> : null}
    {createdOrders.length ? <Alert tone="success" title={`${t("Создано черновиков:", "Жасалған жобалар:", "Drafts created:")} ${createdOrders.length}`}>{createdOrders.map((order, index) => <button type="button" className={styles.orderLink} key={order.id} onClick={() => navigate(`/orders?id=${encodeURIComponent(order.id)}`)}>{order.supplier_name || `${t("Заказ", "Тапсырыс", "Order")} ${index + 1}`}: {t("открыть черновик", "жобаны ашу", "open draft")}</button>)}</Alert> : null}
    {catalogLoading ? <RunSkeleton /> : <>
      <Card title={t('Новый расчёт', 'Жаңа есеп', 'New run')} subtitle={t('Данные берутся из последней завершённой загрузки', 'Деректер соңғы аяқталған жүктеуден алынады', 'Data comes from the latest completed import')}>
        <div className={styles.controls}>
          <Select label={t('Склад', 'Қойма', 'Warehouse')} wrapperClassName={styles.selectControl} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">{t('Выберите склад', 'Қойманы таңдаңыз', 'Select warehouse')}</option>{warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
          <Select label={t('Категория', 'Санат', 'Category')} wrapperClassName={styles.selectControl} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">{t('Все категории', 'Барлық санаттар', 'All categories')}</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
          <label>{t('Дата среза', 'Дерек күні', 'Snapshot date')}<input type="date" value={asOf} max={today} onChange={(event) => setAsOf(event.target.value)} /></label>
          <Button variant="primary" icon={<Play size={16} strokeWidth={1.8} />} loading={busy === "run"} disabled={!warehouseId || !asOf || !validHistoryDays || busy !== null} onClick={() => void startRun()}>{t('Рассчитать', 'Есептеу', 'Calculate')}</Button>
        </div>
        <details className={styles.runOptions}><summary>{t('Дополнительные параметры', 'Қосымша параметрлер', 'Additional settings')}</summary><label>{t('Глубина истории, дней', 'Тарих тереңдігі, күн', 'History length, days')}<input type="number" min={28} max={3650} step={1} value={historyDays} aria-invalid={!validHistoryDays} onChange={(event) => setHistoryDays(Number(event.target.value))} /></label><p>{t('От 28 до 3650 дней. Значение по умолчанию — 1095.', '28–3650 күн. Әдепкі мән — 1095.', '28 to 3650 days. Default is 1095.')}</p></details>
        {!warehouses.length ? <p className={styles.note}>{t('Склады пока не загружены. Сначала примените подготовленные данные; демонстрационный расчёт доступен отдельно.', 'Қоймалар әлі жүктелмеген. Алдымен дайын деректерді қолданыңыз; демо есеп бөлек қолжетімді.', 'Warehouses have not been loaded. Apply prepared data first; the demo run is available separately.')}</p> : null}
      </Card>

      {overview ? <section className={styles.overview} aria-label={t('Состояние закупок', 'Сатып алу жағдайы', 'Purchasing status')}>
        <Tile label={t('Срочно заказать', 'Шұғыл тапсырыс', 'Order urgently')} value={overview.deficit_count} hint={t('позиции в последнем расчёте', 'соңғы есептегі позициялар', 'items in latest run')} tone={overview.deficit_count ? "up" : "good"} />
        <Tile label={t('Избыток', 'Артық қор', 'Excess')} value={overview.excess_count} hint={t('позиции без потребности', 'сұраныс жоқ позициялар', 'items with no demand')} />
        <Tile label={t('Нужна проверка', 'Тексеру қажет', 'Needs review')} value={overview.blocked_count} hint={t('позиции с неполными данными', 'деректері толық емес позициялар', 'items with incomplete data')} tone={overview.blocked_count ? "warn" : "good"} />
        <Tile label={t('Черновики', 'Жобалар', 'Drafts')} value={overview.draft_order_count} hint={t('заказы ждут решения', 'шешім күтіп тұрған тапсырыстар', 'orders awaiting a decision')} tone={overview.draft_order_count ? "warn" : "default"} />
        <p className={styles.overviewNote}>{overview.latest_run ? `${t("Срез от", "Дерек күні", "Snapshot on")} ${overview.latest_run.as_of}; ${t("источников в срезе:", "дереккөздер саны:", "sources:")} ${overview.source_versions.length}.` : t('Нет завершённого расчёта для выбранного склада.', 'Таңдалған қойма бойынша аяқталған есеп жоқ.', 'No completed run for the selected warehouse.')}</p>
      </section> : null}

      <Card title={t('История расчётов', 'Есептер тарихы', 'Run history')} subtitle={t('Выберите сохранённый результат', 'Сақталған нәтижені таңдаңыз', 'Select a saved result')}>
        <Select label={t('Склад в истории', 'Тарихтағы қойма', 'Warehouse in history')} wrapperClassName={styles.historyFilter} value={warehouseFilter} onChange={(event) => { if (event.target.value) setWarehouseId(event.target.value); updateParams({ warehouse: event.target.value, history_offset: null, run: null, recommendation: null, offset: null }); }}><option value="">{t('Все склады', 'Барлық қоймалар', 'All warehouses')}</option>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        {runsLoadedKey !== historyKey && !historyError ? <div className={styles.skeletonCard} role="status" aria-busy="true" aria-label={t('Загружаем историю', 'Тарих жүктелуде', 'Loading history')}><i /><i /><i /></div> : null}
        {historyError ? <div><Alert tone="danger" title={t('Не удалось загрузить историю', 'Тарих жүктелмеді', 'Could not load history')}>{historyError}</Alert><Button variant="secondary" size="sm" onClick={() => setHistoryRetry((current) => current + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</Button></div> : null}
        <div className={styles.runList}>{visibleRuns.map((item) => <button type="button" key={item.id} className={`${styles.runItem} ${runId === item.id ? styles.activeRun : ""}`} onClick={() => updateParams({ run: item.id, recommendation: null, offset: null })} aria-current={runId === item.id ? "true" : undefined}>
          <span>{item.as_of} · {warehouses.find((warehouse) => warehouse.id === item.warehouse_id)?.name ?? t('Склад', 'Қойма', 'Warehouse')}</span><small>{runLabel(item, t)}</small>
        </button>)}</div>
        {runsLoadedKey === historyKey && !visibleRuns.length ? <p className={styles.note}>{historyOffset ? t('На этой странице расчётов нет.', 'Бұл бетте есеп жоқ.', 'No runs on this page.') : t('Расчётов для выбранного склада пока нет.', 'Таңдалған қойма бойынша әзірге есеп жоқ.', 'No runs yet for this warehouse.')}</p> : null}
        {runsTotal > historyLimit || historyOffset > 0 ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={historyOffset === 0 || runsLoadedKey !== historyKey} onClick={() => updateParams({ history_offset: String(Math.max(0, historyOffset - historyLimit)), run: null, recommendation: null, offset: null })}>{t('Назад', 'Артқа', 'Previous')}</Button><span>{visibleRuns.length ? `${historyOffset + 1}–${historyOffset + visibleRuns.length}` : `${historyOffset + 1}`} {t("из", "ішінен", "of")} {runsTotal}</span><Button variant="secondary" size="sm" disabled={historyOffset + historyLimit >= runsTotal || runsLoadedKey !== historyKey} onClick={() => updateParams({ history_offset: String(historyOffset + historyLimit), run: null, recommendation: null, offset: null })}>{t('Далее', 'Келесі', 'Next')}</Button></div> : null}
      </Card>

      {runError ? <div><Alert tone="danger" title={t('Не удалось обновить расчёт', 'Есеп жаңартылмады', 'Could not refresh run')}>{runError}</Alert><Button variant="secondary" size="sm" onClick={() => setRunRetry((current) => current + 1)}>{t('Повторить сейчас', 'Қазір қайталау', 'Retry now')}</Button></div> : null}
      {run?.status === "queued" || run?.status === "running" ? <Card title={t('Расчёт выполняется', 'Есептеу жүріп жатыр', 'Run in progress')} subtitle={t('Страница обновит результат автоматически', 'Нәтиже автоматты түрде жаңарады', 'The result will update automatically')}><div className={styles.steps} role="status" aria-live="polite">{job?.steps.length ? job.steps.map((step) => <span key={step.name}><Check size={14} strokeWidth={1.8} aria-hidden="true" className={step.state === "done" ? styles.stepDone : ""} />{step.name}</span>) : <span><RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />{t('Готовим данные и прогноз', 'Деректер мен болжам дайындалуда', 'Preparing data and forecast')}</span>}</div></Card> : null}
      {run?.status === "failed" ? <Alert tone="danger" title={t('Расчёт завершился с ошибкой', 'Есеп қателікпен аяқталды', 'Run failed')}>{run.error ?? t('Проверьте источники данных и попробуйте снова.', 'Дереккөздерді тексеріп, қайта көріңіз.', 'Check data sources and try again.')}</Alert> : null}
      {run?.warnings.length ? <Alert tone="warning" title={t('Замечания к данным', 'Деректер бойынша ескертулер', 'Data notices')}>{describeWarnings(run.warnings, t)}</Alert> : null}

      {run?.status === "done" ? <>
        <Card title={t('Рекомендации', 'Ұсынымдар', 'Recommendations')} subtitle={visiblePage ? `${visiblePage.total} ${t("позиций", "позиция", "items")} · ${t("расчёт", "есеп", "run")} ${run.as_of}` : recommendationsError ? t('Результат временно недоступен', 'Нәтиже уақытша қолжетімсіз', 'Result temporarily unavailable') : t('Загружаем результат', 'Нәтиже жүктелуде', 'Loading result')}>
          <div className={styles.listControls}>
            <Select label={t('Срочность', 'Шұғылдық', 'Urgency')} wrapperClassName={styles.selectControl} value={urgencyFilter} onChange={(event) => updateParams({ urgency: event.target.value, offset: null, recommendation: null })}><option value="">{t('Все', 'Барлығы', 'All')}</option><option value="critical">{t('Критично', 'Өте шұғыл', 'Critical')}</option><option value="high">{t('Высокий', 'Жоғары', 'High')}</option><option value="normal">{t('Планово', 'Жоспарлы', 'Planned')}</option><option value="none">{t('Без заказа', 'Тапсырыссыз', 'No order')}</option></Select>
            <Select label={t('Поставщик', 'Жеткізуші', 'Supplier')} wrapperClassName={styles.selectControl} value={supplierFilter} onChange={(event) => updateParams({ supplier: event.target.value, offset: null, recommendation: null })}><option value="">{t('Все поставщики', 'Барлық жеткізушілер', 'All suppliers')}</option>{suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</Select>
            <Button variant="primary" size="sm" icon={<ArrowRight size={15} strokeWidth={1.8} />} disabled={!visiblePage || loadingRows || !selectedOrderableCount || busy !== null} onClick={() => { setOrderError(null); setConflictIds([]); setPreviewOpen(true); }}>{t("Создать черновики", "Жобалар жасау", "Create drafts")} ({selectedOrderableCount})</Button>
          </div>
          {!visiblePage && !recommendationsError ? <div className={styles.skeletonCard} role="status" aria-busy="true" aria-label={t('Загружаем рекомендации', 'Ұсынымдар жүктелуде', 'Loading recommendations')}><i /><i /><i /><i /></div> : null}
          {recommendationsError ? <div><Alert tone="danger" title={t('Не удалось загрузить рекомендации', 'Ұсынымдар жүктелмеді', 'Could not load recommendations')}>{recommendationsError}</Alert><Button variant="secondary" size="sm" onClick={() => setRecommendationsRetry((current) => current + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</Button></div> : null}
          {visiblePage && !rows.length ? <EmptyState title={t('Позиций нет', 'Позициялар жоқ', 'No items')} text={t('Для выбранного фильтра рекомендаций не найдено.', 'Таңдалған сүзгіге сай ұсыным жоқ.', 'No recommendations match the filter.')} /> : null}
          {grouped.map(([supplierId, supplierRows]) => <section className={styles.group} key={supplierId} aria-label={supplierId === "none" ? t('Без поставщика', 'Жеткізушісіз', 'No supplier') : supplierNames.get(supplierId) ?? t('Поставщик', 'Жеткізуші', 'Supplier')}>
            <div className={styles.groupHeader}><h3>{supplierId === "none" ? t('Без поставщика', 'Жеткізушісіз', 'No supplier') : supplierNames.get(supplierId) ?? `${t("Поставщик", "Жеткізуші", "Supplier")} ${supplierId.slice(0, 8)}`}</h3>{supplierRows.some(isOrderable) ? <Button variant="ghost" size="sm" disabled={loadingRows || busy !== null} onClick={() => toggleSupplierPage(supplierRows)}>{supplierRows.filter(isOrderable).every((row) => selected.has(row.id)) ? t('Снять выбор на странице', 'Осы беттегі таңдауды алып тастау', 'Clear page selection') : t('Выбрать доступные на странице', 'Осы беттегі қолжетімділерді таңдау', 'Select available on page')}</Button> : null}</div>
            <Table><thead><Tr><Th>{t('Выбор', 'Таңдау', 'Select')}</Th><Th>{t('Товар', 'Тауар', 'Product')}</Th><Th>{t('Статус', 'Мәртебе', 'Status')}</Th><Th numeric>{t('Заказать', 'Тапсырыс беру', 'Order')}</Th><Th>{t('Обоснование', 'Негіздеме', 'Rationale')}</Th></Tr></thead><tbody>{supplierRows.map((row) => <Tr key={row.id}>
              <Td><input type="checkbox" aria-label={`${t("Выбрать", "Таңдау", "Select")} ${row.name}`} checked={selected.has(row.id) && isOrderable(row)} disabled={loadingRows || !isOrderable(row)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></Td>
              <Td><button type="button" className={styles.productLink} onClick={() => navigate(`/recommendations/${row.id}?${new URLSearchParams({ from: `${location.pathname}${location.search}${location.hash}` })}`)}>{row.name}</button><small className={styles.sku}>{row.sku}</small></Td>
              <Td>{row.order_id ? <><Badge tone="info">{t('В заказе', 'Тапсырыста', 'In order')}</Badge><button type="button" className={styles.orderLink} onClick={() => navigate(`/orders?id=${encodeURIComponent(row.order_id!)}`)}>{t('Открыть заказ', 'Тапсырысты ашу', 'Open order')}</button></> : <Badge tone={row.status === "blocked" ? "danger" : urgency[row.urgency].tone}>{row.status === "blocked" ? t('Нет данных', 'Дерек жоқ', 'No data') : t(urgency[row.urgency].label, row.urgency === "critical" ? "Өте шұғыл" : row.urgency === "high" ? "Жоғары" : row.urgency === "normal" ? "Жоспарлы" : "Тапсырыссыз", row.urgency === "critical" ? "Critical" : row.urgency === "high" ? "High" : row.urgency === "normal" ? "Planned" : "No order")}</Badge>}</Td>
              <Td numeric>{row.status === "blocked" ? "—" : `${quantity(row.recommended_quantity)} ${row.unit}`}</Td>
              <Td className={styles.explanation}>{row.explanation}</Td>
            </Tr>)}</tbody></Table>
          </section>)}
          {visiblePage && visiblePage.total > visiblePage.limit ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={offset === 0 || loadingRows} onClick={() => updateParams({ offset: String(Math.max(0, offset - visiblePage.limit)), recommendation: null })}>{t('Назад', 'Артқа', 'Previous')}</Button><span>{offset + 1}–{Math.min(offset + visiblePage.limit, visiblePage.total)} {t("из", "ішінен", "of")} {visiblePage.total}</span><Button variant="secondary" size="sm" disabled={offset + visiblePage.limit >= visiblePage.total || loadingRows} onClick={() => updateParams({ offset: String(offset + visiblePage.limit), recommendation: null })}>{t('Далее', 'Келесі', 'Next')}</Button></div> : null}
        </Card>

        {recommendationId ? <Card title={detail?.name ?? t('Обоснование позиции', 'Позиция негіздемесі', 'Item rationale')} subtitle={detail ? `${detail.sku} · ${detail.unit}` : t('Загружаем объяснение', 'Түсіндірме жүктелуде', 'Loading explanation')}>
          <div className={styles.detailHead}><p>{detail?.explanation}</p><Button variant="ghost" size="sm" onClick={() => updateParams({ recommendation: null })}>{t('Закрыть', 'Жабу', 'Close')}</Button></div>
          {loadingDetail && !detail ? <div className={styles.skeletonCard} role="status" aria-busy="true" aria-label={t('Загружаем обоснование', 'Негіздеме жүктелуде', 'Loading rationale')}><i /><i /><i /></div> : null}
          {detail ? <div className={styles.detailBody}>
            {detail.details.warnings.length ? <Alert tone="warning" title={t('Ограничения расчёта', 'Есептеу шектеулері', 'Calculation limitations')}>{describeWarnings(detail.details.warnings, t)}</Alert> : null}
            {detail.status === "blocked" ? <Alert tone="info">{t("Промежуточный результат:", "Аралық нәтиже:", "Provisional result:")} {quantity(detail.recommended_quantity)} {detail.unit}. {t("Он получен при неполных данных и не является количеством к заказу.", "Ол толық емес деректерден алынған және тапсырыс саны емес.", "It uses incomplete data and is not an order quantity.")}</Alert> : null}
            <dl className={styles.breakdown}>{Object.keys(detail.details.breakdown).map((key) => <div key={key}><dt>{breakdownLabels[key] ?? t('Параметр расчёта', 'Есептеу параметрі', 'Calculation parameter')}</dt><dd>{breakdownValue(detail, key, t)}</dd></div>)}</dl>
            <div className={styles.detailFacts}><p>{t("История:", "Тарих:", "History:")} {detail.details.history.length} {t("дн.", "күн", "days")}</p><p>{t("Прогноз:", "Болжам:", "Forecast:")} {detail.details.forecast.length} {t("дн.", "күн", "days")}</p><p>{t("Исключено продаж:", "Алып тасталған сатылым:", "Excluded sales:")} {detail.details.excluded_sales.length}</p><p>{t("Поступлений в пути:", "Жолдағы жеткізілім:", "Inbound deliveries:")} {detail.details.inbound.length}</p></div>
          </div> : null}
        </Card> : null}
      </> : null}
    </>}

    <Modal id="create-orders" title={t('Создать черновики заказов', 'Тапсырыс жобаларын жасау', 'Create order drafts')} open={previewOpen} onOpenChange={(open) => { if (busy === "orders" && !open) return; setPreviewOpen(open); if (!open) { setOrderError(null); setConflictIds([]); } }} closeOnEscape={busy !== "orders"} closeOnBackdrop={busy !== "orders"} showClose={busy !== "orders"} size="md" footer={<><Button variant="secondary" disabled={busy === "orders"} onClick={() => setPreviewOpen(false)}>{t('Вернуться', 'Оралу', 'Back')}</Button><Button variant="primary" loading={busy === "orders"} disabled={!selectedOrderableCount || busy === "orders"} onClick={() => void submitOrders()}>{t('Создать черновики', 'Жобалар жасау', 'Create drafts')}</Button></>}>
      {orderError ? <Alert tone="danger" title={t('Заказ не создан', 'Тапсырыс жасалмады', 'Order not created')}>{orderError}{conflictOrders.length ? <div className={styles.conflictLinks}>{conflictOrders.map((row) => <button type="button" className={styles.orderLink} key={row.id} onClick={() => navigate(`/orders?id=${encodeURIComponent(row.order_id!)}`)}>{row.name}: {t("открыть заказ", "тапсырысты ашу", "open order")}</button>)}</div> : null}</Alert> : null}
      <ActionPreview items={[`${t("Выбрано рекомендаций:", "Таңдалған ұсынымдар:", "Recommendations selected:")} ${selectedOrderableCount}. ${t("Система сгруппирует их по поставщику и складу", "Жүйе оларды жеткізуші мен қойма бойынша топтастырады", "The system will group them by supplier and warehouse")}`, ...selectedUnits.map(([unit, values]) => `${sumQuantities(values)} ${unit} ${t("по", "бойынша", "across")} ${values.length} ${t("позициям", "позиция", "items")}`), t('После создания количество можно исправить с указанием причины', 'Жасағаннан кейін санын себебін көрсетіп түзетуге болады', 'Quantity can be changed with a reason after creation')]} note={t('Заказы останутся черновиками. Поставщикам ничего не отправляется.', 'Тапсырыстар жоба күйінде қалады. Жеткізушілерге ештеңе жіберілмейді.', 'Orders remain drafts. Nothing is sent to suppliers.')} />
    </Modal>
  </div>;
}


