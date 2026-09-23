import { ArrowRight, Check, ClipboardList, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Modal, Select, Table, Td, Th, Tile, Tr } from "../../../shared/ui";
import { ApiError } from "../../../shared/api/client";
import { createOrders, createRun, getCatalog, getJob, getOverview, getRecommendation, getRecommendations, getRun, getRuns } from "../api/runs";
import type { CatalogOption, JobStatus, ReplenishmentOverview, Run, SavedRecommendation, SavedRecommendationDetail, SavedRecommendationPage } from "../runTypes";
import styles from "./RunsPage.module.css";

const urgency = {
  none: { label: "Без заказа", tone: "neutral" },
  normal: { label: "Планово", tone: "neutral" },
  high: { label: "Высокий", tone: "warning" },
  critical: { label: "Критично", tone: "danger" },
} as const;

const historyLimit = 30;
const orderAttemptStorage = "hackalem.order-attempt";

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "У вашей роли нет права на это действие. Войдите как закупщик или администратор.";
  return error instanceof Error ? error.message : "Не удалось выполнить действие.";
}

function quantity(value: string): string {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction && Number(fraction) ? `${grouped},${fraction.replace(/0+$/, "")}` : grouped;
}

function isOrderable(row: SavedRecommendation): boolean {
  return row.status === "ready" && row.supplier_id !== null && Number(row.recommended_quantity) > 0;
}

function runLabel(run: Run): string {
  return `${run.as_of} · ${run.status === "done" ? "готов" : run.status === "failed" ? "ошибка" : "считается"}`;
}

function RunSkeleton() {
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Загружаем расчёты">
    <div className={styles.skeletonCard}><i /><i /><i /></div>
    <div className={styles.skeletonCard}><i /><i /><i /><i /></div>
  </div>;
}

export function RunsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [warehouses, setWarehouses] = useState<CatalogOption[]>([]);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [suppliers, setSuppliers] = useState<CatalogOption[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsLoadedOffset, setRunsLoadedOffset] = useState<number | null>(null);
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const orderAttempt = useRef<{ signature: string; key: string } | null>(null);
  const activeRunId = useRef<string | null>(null);

  const historyOffset = Math.max(0, Math.floor(Number(params.get("history_offset") || "0") || 0));
  const visibleRuns = runsLoadedOffset === historyOffset ? runs : [];
  const runId = params.get("run") ?? visibleRuns[0]?.id ?? null;
  const recommendationId = params.get("recommendation");
  const offset = Math.max(0, Math.floor(Number(params.get("offset") || "0") || 0));
  const urgencyFilter = params.get("urgency") ?? "";
  const pageKey = `${runId ?? ""}:${offset}:${urgencyFilter}`;
  const visiblePage = pageLoadedKey === pageKey ? page : null;
  const supplierNames = useMemo(() => new Map(suppliers.map((item) => [item.id, item.name])), [suppliers]);

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
        setWarehouseId((current) => current || nextWarehouses[0]?.id || "");
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
    getRuns(historyOffset, controller.signal)
      .then((next) => { setRuns(next.items); setRunsTotal(next.total); setRunsLoadedOffset(historyOffset); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setHistoryError(errorText(caught)); });
    return () => controller.abort();
  }, [historyOffset, historyRetry]);

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
    getRecommendations(runId, offset, urgencyFilter, controller.signal)
      .then((next) => { setPage(next); setPageLoadedKey(pageKey); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setRecommendationsError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingRows(false); });
    return () => controller.abort();
  }, [runId, run?.id, run?.status, offset, urgencyFilter, pageKey, recommendationsRetry]);

  useEffect(() => { setSelected(new Set()); setPreviewOpen(false); }, [runId, urgencyFilter, offset]);

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
    if (!warehouseId) return;
    setBusy("run");
    setError(null);
    try {
      const next = await createRun({ warehouse_id: warehouseId, category_id: categoryId || null, as_of: asOf, idempotency_key: crypto.randomUUID(), parameters: { history_days: 1095 } });
      setRunsLoadedOffset(null);
      setHistoryRetry((current) => current + 1);
      updateParams({ history_offset: null, run: next.id, recommendation: null, offset: null, urgency: null });
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  }

  async function submitOrders() {
    if (!selected.size || !visiblePage || loadingRows) return;
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
    setError(null);
    try {
      const orders = await createOrders(ids, attempt.key);
      orderAttempt.current = null;
      try { sessionStorage.removeItem(orderAttemptStorage); } catch { /* Хранилище недоступно. */ }
      setPreviewOpen(false);
      setSelected(new Set());
      if (orders[0]) navigate(`/orders?id=${encodeURIComponent(orders[0].id)}`);
    } catch (caught) { setError(errorText(caught)); }
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

  return <div className={styles.page}>
    <PageHeader title="Расчёты пополнения" subtitle="Сохранённые рекомендации по товарам и складам" actions={<Button variant="secondary" size="sm" icon={<ClipboardList size={15} strokeWidth={1.8} />} onClick={() => navigate("/recommendations/demo")}>Открыть демо</Button>} />

    {error ? <Alert tone="danger" title="Не удалось выполнить действие">{error}</Alert> : null}
    {catalogLoading ? <RunSkeleton /> : <>
      <Card title="Новый расчёт" subtitle="Данные берутся из последней завершённой загрузки 1С">
        <div className={styles.controls}>
          <Select label="Склад" wrapperClassName={styles.selectControl} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">Выберите склад</option>{warehouses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
          <Select label="Категория" wrapperClassName={styles.selectControl} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Все категории</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
          <label>Дата среза<input type="date" value={asOf} max={today} onChange={(event) => setAsOf(event.target.value)} /></label>
          <Button variant="primary" icon={<Play size={16} strokeWidth={1.8} />} loading={busy === "run"} disabled={!warehouseId || !asOf || busy !== null} onClick={() => void startRun()}>Рассчитать</Button>
        </div>
        {!warehouses.length ? <p className={styles.note}>Склады пока не загружены. Для работы с реальными данными сначала примените источник 1С; демонстрационный расчёт доступен отдельно.</p> : null}
      </Card>

      {overview ? <section className={styles.overview} aria-label="Состояние закупок">
        <Tile label="Срочно заказать" value={overview.deficit_count} hint="позиции в последнем расчёте" tone={overview.deficit_count ? "up" : "good"} />
        <Tile label="Избыток" value={overview.excess_count} hint="позиции без потребности" />
        <Tile label="Нужна проверка" value={overview.blocked_count} hint="позиции с неполными данными" tone={overview.blocked_count ? "warn" : "good"} />
        <Tile label="Черновики" value={overview.draft_order_count} hint="заказы ждут решения" tone={overview.draft_order_count ? "warn" : "default"} />
        <p className={styles.overviewNote}>{overview.latest_run ? `Срез от ${overview.latest_run.as_of}; источников в срезе: ${overview.source_versions.length}.` : "Нет завершённого расчёта для выбранного склада."}</p>
      </section> : null}

      {runsTotal || historyOffset || runsLoadedOffset !== historyOffset ? <Card title="История расчётов" subtitle="Выберите сохранённый результат">
        {runsLoadedOffset !== historyOffset && !historyError ? <div className={styles.skeletonCard} role="status" aria-busy="true" aria-label="Загружаем историю"><i /><i /><i /></div> : null}
        {historyError ? <div><Alert tone="danger" title="Не удалось загрузить историю">{historyError}</Alert><Button variant="secondary" size="sm" onClick={() => setHistoryRetry((current) => current + 1)}>Повторить</Button></div> : null}
        <div className={styles.runList}>{visibleRuns.map((item) => <button type="button" key={item.id} className={`${styles.runItem} ${runId === item.id ? styles.activeRun : ""}`} onClick={() => updateParams({ run: item.id, recommendation: null, offset: null })} aria-current={runId === item.id ? "true" : undefined}>
          <span>{item.as_of} · {warehouses.find((warehouse) => warehouse.id === item.warehouse_id)?.name ?? "Склад"}</span><small>{runLabel(item)}</small>
        </button>)}</div>
        {runsLoadedOffset === historyOffset && !visibleRuns.length ? <p className={styles.note}>На этой странице расчётов нет.</p> : null}
        {runsTotal > historyLimit || historyOffset > 0 ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={historyOffset === 0 || runsLoadedOffset !== historyOffset} onClick={() => updateParams({ history_offset: String(Math.max(0, historyOffset - historyLimit)), run: null, recommendation: null, offset: null })}>Назад</Button><span>{visibleRuns.length ? `${historyOffset + 1}–${historyOffset + visibleRuns.length}` : `${historyOffset + 1}`} из {runsTotal}</span><Button variant="secondary" size="sm" disabled={historyOffset + historyLimit >= runsTotal || runsLoadedOffset !== historyOffset} onClick={() => updateParams({ history_offset: String(historyOffset + historyLimit), run: null, recommendation: null, offset: null })}>Далее</Button></div> : null}
      </Card> : <EmptyState title="Расчётов пока нет" text="После загрузки данных выберите склад и запустите первый расчёт." />}

      {runError ? <div><Alert tone="danger" title="Не удалось обновить расчёт">{runError}</Alert><Button variant="secondary" size="sm" onClick={() => setRunRetry((current) => current + 1)}>Повторить сейчас</Button></div> : null}
      {run?.status === "queued" || run?.status === "running" ? <Card title="Расчёт выполняется" subtitle="Страница обновит результат автоматически"><div className={styles.steps} role="status" aria-live="polite">{job?.steps.length ? job.steps.map((step) => <span key={step.name}><Check size={14} strokeWidth={1.8} aria-hidden="true" className={step.state === "done" ? styles.stepDone : ""} />{step.name}</span>) : <span><RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />Готовим данные и прогноз</span>}</div></Card> : null}
      {run?.status === "failed" ? <Alert tone="danger" title="Расчёт завершился с ошибкой">{run.error ?? "Проверьте источники данных и попробуйте снова."}</Alert> : null}
      {run?.warnings.length ? <Alert tone="warning" title="Замечания к данным">{run.warnings.join(" · ")}</Alert> : null}

      {run?.status === "done" ? <>
        <Card title="Рекомендации" subtitle={visiblePage ? `${visiblePage.total} позиций · расчёт ${run.as_of}` : recommendationsError ? "Результат временно недоступен" : "Загружаем результат"}>
          <div className={styles.listControls}>
            <Select label="Срочность" wrapperClassName={styles.selectControl} value={urgencyFilter} onChange={(event) => updateParams({ urgency: event.target.value, offset: null, recommendation: null })}><option value="">Все</option><option value="critical">Критично</option><option value="high">Высокий</option><option value="normal">Планово</option><option value="none">Без заказа</option></Select>
            <Button variant="primary" size="sm" icon={<ArrowRight size={15} strokeWidth={1.8} />} disabled={!visiblePage || loadingRows || !selected.size || busy !== null} onClick={() => setPreviewOpen(true)}>Создать черновики ({visiblePage ? selected.size : 0})</Button>
          </div>
          {!visiblePage && !recommendationsError ? <div className={styles.skeletonCard} role="status" aria-busy="true" aria-label="Загружаем рекомендации"><i /><i /><i /><i /></div> : null}
          {recommendationsError ? <div><Alert tone="danger" title="Не удалось загрузить рекомендации">{recommendationsError}</Alert><Button variant="secondary" size="sm" onClick={() => setRecommendationsRetry((current) => current + 1)}>Повторить</Button></div> : null}
          {visiblePage && !rows.length ? <EmptyState title="Позиций нет" text="Для выбранного фильтра рекомендаций не найдено." /> : null}
          {grouped.map(([supplierId, supplierRows]) => <section className={styles.group} key={supplierId} aria-label={supplierId === "none" ? "Без поставщика" : supplierNames.get(supplierId) ?? "Поставщик"}>
            <h3>{supplierId === "none" ? "Без поставщика" : supplierNames.get(supplierId) ?? `Поставщик ${supplierId.slice(0, 8)}`}</h3>
            <Table><thead><Tr><Th>Выбор</Th><Th>Товар</Th><Th>Статус</Th><Th numeric>Заказать</Th><Th>Обоснование</Th></Tr></thead><tbody>{supplierRows.map((row) => <Tr key={row.id}>
              <Td><input type="checkbox" aria-label={`Выбрать ${row.name}`} checked={selected.has(row.id)} disabled={loadingRows || !isOrderable(row)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></Td>
              <Td><button type="button" className={styles.productLink} onClick={() => navigate(`/recommendations/${row.id}?${new URLSearchParams({ from: `${location.pathname}${location.search}${location.hash}` })}`)}>{row.name}</button><small className={styles.sku}>{row.sku}</small></Td>
              <Td><Badge tone={row.status === "blocked" ? "danger" : urgency[row.urgency].tone}>{row.status === "blocked" ? "Нет данных" : urgency[row.urgency].label}</Badge></Td>
              <Td numeric>{quantity(row.recommended_quantity)} {row.unit}</Td>
              <Td className={styles.explanation}>{row.explanation}</Td>
            </Tr>)}</tbody></Table>
          </section>)}
          {visiblePage && visiblePage.total > visiblePage.limit ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={offset === 0 || loadingRows} onClick={() => updateParams({ offset: String(Math.max(0, offset - visiblePage.limit)), recommendation: null })}>Назад</Button><span>{offset + 1}–{Math.min(offset + visiblePage.limit, visiblePage.total)} из {visiblePage.total}</span><Button variant="secondary" size="sm" disabled={offset + visiblePage.limit >= visiblePage.total || loadingRows} onClick={() => updateParams({ offset: String(offset + visiblePage.limit), recommendation: null })}>Далее</Button></div> : null}
        </Card>

        {recommendationId ? <Card title={detail?.name ?? "Обоснование позиции"} subtitle={detail ? `${detail.sku} · ${detail.unit}` : "Загружаем объяснение"}>
          <div className={styles.detailHead}><p>{detail?.explanation}</p><Button variant="ghost" size="sm" onClick={() => updateParams({ recommendation: null })}>Закрыть</Button></div>
          {loadingDetail && !detail ? <div className={styles.skeletonCard} role="status" aria-busy="true" aria-label="Загружаем обоснование"><i /><i /><i /></div> : null}
          {detail ? <div className={styles.detailBody}>
            {detail.details.warnings.length ? <Alert tone="warning" title="Ограничения расчёта">{detail.details.warnings.join(" · ")}</Alert> : null}
            <dl className={styles.breakdown}>{Object.entries(detail.details.breakdown).filter(([, value]) => value !== null).map(([key, value]) => <div key={key}><dt>{breakdownLabels[key] ?? key}</dt><dd>{typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? quantity(value) : String(value)}</dd></div>)}</dl>
            <div className={styles.detailFacts}><p>История: {detail.details.history.length} дн.</p><p>Прогноз: {detail.details.forecast.length} дн.</p><p>Исключено продаж: {detail.details.excluded_sales.length}</p><p>Поступлений в пути: {detail.details.inbound.length}</p></div>
          </div> : null}
        </Card> : null}
      </> : null}
    </>}

    <Modal id="create-orders" title="Создать черновики заказов" open={previewOpen} onOpenChange={setPreviewOpen} size="md" footer={<><Button variant="secondary" onClick={() => setPreviewOpen(false)}>Вернуться</Button><Button variant="primary" loading={busy === "orders"} onClick={() => void submitOrders()}>Создать черновики</Button></>}>
      <ActionPreview items={[`Выбрано рекомендаций: ${selected.size}. Система сгруппирует их по поставщику и складу`, "После создания количество можно исправить с указанием причины"]} note="Заказы останутся черновиками. Поставщикам ничего не отправляется." />
    </Modal>
  </div>;
}

const breakdownLabels: Record<string, string> = {
  raw_sales: "Продажи", corrected_sales: "Спрос после корректировок", excluded_quantity: "Исключённый выброс", lost_demand: "Упущенный спрос", baseline_daily: "Базовый спрос в день", forecast_quantity: "Прогноз на горизонт", safety_stock: "Страховой запас", available_stock: "Доступный остаток", inbound_quantity: "Поступит в срок", unrounded_quantity: "До округления", rounding_increment: "Добавлено округлением", recommended_quantity: "К заказу", lead_time_days: "Срок поставки, дней", review_days: "Период пересмотра, дней", horizon_days: "Горизонт, дней", safety_days: "Дни страхового запаса", seasonality_method: "Метод сезонности", shortage_date: "Дата дефицита", excess_quantity: "Избыток", trend_daily_slope: "Рост в день",
};
