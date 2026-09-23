import { ArrowRight, Boxes, ClipboardList, Database, RefreshCw, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { Alert, Badge, Button, Card, EmptyState, Select, Tile } from "../../../shared/ui";
import { getOverview, getOverviewWarehouses } from "../api/overview";
import type { Overview, WarehouseOption } from "../api/overview";
import styles from "./OverviewPage.module.css";

const warningText: Record<string, string> = {
  no_successful_calculation: "Успешного расчёта пока нет.",
  incomplete_sources: "В расчёте использованы неполные источники данных.",
  missing_client_ids_day_level_outliers_only: "Нет обезличенных ID клиентов: крупные продажи выявлены только по дням.",
  insufficient_history_for_annual_seasonality: "Истории недостаточно для годовой сезонности.",
  stale_stock_snapshot: "Остатки на дату расчёта могли устареть.",
  overdue_inbound_excluded: "Просроченные поступления исключены из расчёта.",
};

const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Дата неизвестна";

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "У вашей роли нет доступа к обзору закупок.";
  return error instanceof Error ? error.message : "Не удалось загрузить обзор.";
}

function OverviewSkeleton() {
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Загружаем обзор закупок">
    <div className={styles.skeletonTiles} aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><i /><i /></div>)}</div>
    <div className={styles.skeletonCards} aria-hidden="true"><div><i /><i /><i /></div><div><i /><i /><i /></div></div>
  </div>;
}

function Snapshot({ overview, warehouseName }: { overview: Overview; warehouseName: string }) {
  const navigate = useNavigate();
  const run = overview.latest_run;
  if (!run) return <Card><EmptyState title="Расчётов пока нет" text="Загрузите данные и запустите первый расчёт пополнения. После него здесь появятся риски, избыток и версии источников." action={<Button icon={<ArrowRight size={16} />} onClick={() => navigate("/recommendations")}>Перейти к расчётам</Button>} /></Card>;

  const incomplete = overview.source_versions.filter((source) => !source.complete).length;
  return <div className={styles.snapshotGrid}>
    <Card title="Последний успешный расчёт" subtitle="Риски и избыток на одном сохранённом срезе" actions={<Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => navigate(`/recommendations?${new URLSearchParams({ warehouse: run.warehouse_id, run: run.id })}`)}>Открыть</Button>}>
      <dl className={styles.meta}>
        <div><dt>Дата среза</dt><dd>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(new Date(`${run.as_of}T12:00:00`))}</dd></div>
        <div><dt>Склад</dt><dd>{warehouseName}</dd></div>
        <div><dt>Завершён</dt><dd>{dateLabel(run.completed_at)}</dd></div>
      </dl>
      <p className={styles.note}>Показатели не суммируют разные расчёты и склады.</p>
    </Card>
    <Card title="Данные расчёта" subtitle="Версии источников, зафиксированные при запуске" actions={<Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => navigate("/data")}>Источники</Button>}>
      {overview.source_versions.length ? <>
        <p className={styles.sourceSummary}>{overview.source_versions.length} источников · {incomplete ? `${incomplete} неполных` : "все полные"}</p>
        <ul className={styles.sources}>{overview.source_versions.map((source) => <li key={source.source_id}>
          <span>Источник {source.source_id.slice(0, 8)} · версия {source.revision}</span>
          <Badge tone={source.complete ? "success" : "warning"}>{source.complete ? "Полный" : "Неполный"}</Badge>
        </li>)}</ul>
      </> : <p className={styles.muted}>Версии источников для этого расчёта не зафиксированы.</p>}
    </Card>
  </div>;
}

export function OverviewPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const warehouseId = params.get("warehouse") ?? "";
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseError, setWarehouseError] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadedWarehouse, setLoadedWarehouse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getOverviewWarehouses(controller.signal).then(setWarehouses).catch(() => {
      if (!controller.signal.aborted) setWarehouseError(true);
    });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    if (overview && loadedWarehouse === warehouseId) setRefreshing(true);
    else setLoading(true);
    setError(null);
    getOverview(warehouseId, controller.signal).then((next) => { setOverview(next); setLoadedWarehouse(warehouseId); }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(errorText(caught));
    }).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    });
    return () => controller.abort();
  }, [warehouseId, retry]);

  const visibleOverview = loadedWarehouse === warehouseId ? overview : null;
  const run = visibleOverview?.latest_run;
  const warehouseName = warehouses.find((item) => item.id === run?.warehouse_id)?.name ?? (run ? `Склад ${run.warehouse_id.slice(0, 8)}` : "—");
  const warnings = visibleOverview?.warnings.filter((warning) => warning !== "no_successful_calculation") ?? [];

  return <section className={styles.page}>
    <PageHeader title="Обзор закупок" subtitle="Что требует внимания по последнему расчёту" actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} loading={refreshing} onClick={() => setRetry((value) => value + 1)}>Обновить</Button>} />

    <div className={styles.toolbar}>
      <Select label="Склад" wrapperClassName={styles.warehouseSelect} id="overview-warehouse" value={warehouseId} onChange={(event) => {
        const next = new URLSearchParams(params);
        if (event.target.value) next.set("warehouse", event.target.value); else next.delete("warehouse");
        setParams(next);
      }}><option value="">Последний расчёт по всем складам</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</Select>
      {warehouseError ? <span className={styles.muted}>Названия складов недоступны; обзор всё ещё можно обновить.</span> : null}
    </div>

    {loading && !visibleOverview ? <OverviewSkeleton /> : error && !visibleOverview ? <Alert tone="danger" title="Обзор недоступен" action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>Повторить</Button>}>{error}</Alert> : visibleOverview ? <div className={styles.content} aria-busy={refreshing}>
      {error ? <Alert tone="warning" title="Не удалось обновить обзор">Показаны предыдущие данные. {error}</Alert> : null}
      <div className={styles.tiles}>
        <Tile label="Риск дефицита" value={run ? visibleOverview.deficit_count : "—"} hint="Позиций в последнем расчёте" tone={run && visibleOverview.deficit_count ? "up" : "default"} />
        <Tile label="Избыток" value={run ? visibleOverview.excess_count : "—"} hint="Позиций с запасом выше потребности" tone={run && visibleOverview.excess_count ? "warn" : "default"} />
        <Tile label="Заблокировано" value={run ? visibleOverview.blocked_count : "—"} hint="Рекомендаций, требующих проверки" tone={run && visibleOverview.blocked_count ? "warn" : "default"} />
        <Tile label="Черновики заказов" value={visibleOverview.draft_order_count} hint="Актуально на момент запроса" tone="default" />
      </div>
      {warnings.length ? <Alert tone="warning" title="Ограничения расчёта"><ul className={styles.warnings}>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warningText[warning] ?? warning}</li>)}</ul></Alert> : null}
      <Snapshot overview={visibleOverview} warehouseName={warehouseName} />
      <div className={styles.nextSteps}>
        <h2>Продолжить работу</h2>
        <div className={styles.actions}>
          <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={() => navigate(warehouseId ? `/recommendations?${new URLSearchParams({ warehouse: warehouseId })}` : "/recommendations")}>Расчёты</Button>
          <Button variant="secondary" icon={<Boxes size={16} />} onClick={() => navigate(warehouseId ? `/inventory?${new URLSearchParams({ warehouse: warehouseId })}` : "/inventory")}>Остатки склада</Button>
          <Button variant="secondary" icon={<ShoppingCart size={16} />} onClick={() => navigate("/orders")}>Заказы поставщикам</Button>
          <Button variant="secondary" icon={<Database size={16} />} onClick={() => navigate("/data")}>Источники данных</Button>
        </div>
      </div>
    </div> : null}
  </section>;
}
