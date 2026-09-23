import { ArrowRight, Boxes, ClipboardList, Database, RefreshCw, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { Alert, Badge, Button, Card, EmptyState, Select, Tile } from "../../../shared/ui";
import { getOverview, getOverviewWarehouses } from "../api/overview";
import type { Overview, WarehouseOption } from "../api/overview";
import styles from "./OverviewPage.module.css";
import { useI18n, translate, type Locale } from "../../../shared/i18n/I18nContext";

const warningText: Record<string, [string, string, string]> = {
  no_successful_calculation: ["Успешного расчёта пока нет.", "Әзірге сәтті есептеу жоқ.", "No successful calculation yet."],
  incomplete_sources: ["В расчёте использованы неполные источники данных.", "Есепте толық емес дереккөздер қолданылды.", "The calculation used incomplete data sources."],
  missing_client_ids_day_level_outliers_only: ["Нет обезличенных ID клиентов: крупные продажи выявлены только по дням.", "Клиенттердің жасырын ID-лері жоқ: ірі сатылымдар тек күн бойынша анықталды.", "Anonymized client IDs are missing: large sales were detected by day only."],
  insufficient_history_for_annual_seasonality: ["Истории недостаточно для годовой сезонности.", "Жылдық маусымдылықты анықтауға тарих жеткіліксіз.", "There is not enough history for annual seasonality."],
  stale_stock_snapshot: ["Остатки на дату расчёта могли устареть.", "Есептеу күніндегі қор деректері ескірген болуы мүмкін.", "Stock data may be outdated for the calculation date."],
  overdue_inbound_excluded: ["Просроченные поступления исключены из расчёта.", "Мерзімі өткен жеткізілімдер есептен шығарылды.", "Overdue inbound deliveries were excluded."],
};

const dateLabel = (value: string | null, locale: Locale) => value
  ? new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : translate(locale, "Дата неизвестна", "Күні белгісіз", "Date unknown");

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof ApiError && error.status === 403) return translate(locale, "У вашей роли нет доступа к обзору закупок.", "Сіздің рөліңізге сатып алу шолуы қолжетімсіз.", "Your role cannot access the procurement overview.");
  return error instanceof Error ? error.message : translate(locale, "Не удалось загрузить обзор.", "Шолуды жүктеу мүмкін болмады.", "Could not load the overview.");
}

function OverviewSkeleton() {
  const { t } = useI18n();
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label={t("Загружаем обзор закупок", "Сатып алу шолуы жүктелуде", "Loading procurement overview")}>
    <div className={styles.skeletonTiles} aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><i /><i /></div>)}</div>
    <div className={styles.skeletonCards} aria-hidden="true"><div><i /><i /><i /></div><div><i /><i /><i /></div></div>
  </div>;
}

function Snapshot({ overview, warehouseName }: { overview: Overview; warehouseName: string }) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const run = overview.latest_run;
  if (!run) return <Card><EmptyState title={t("Расчётов пока нет", "Әзірге есептеулер жоқ", "No calculations yet")} text={t("Загрузите данные и запустите первый расчёт пополнения. После него здесь появятся риски, избыток и версии источников.", "Деректерді жүктеп, қорды толықтырудың алғашқы есебін іске қосыңыз. Содан кейін мұнда тәуекелдер, артық қор және дереккөз нұсқалары көрсетіледі.", "Upload data and run the first replenishment calculation. Risks, excess stock, and source versions will appear here.")} action={<Button icon={<ArrowRight size={16} />} onClick={() => navigate("/recommendations")}>{t("Перейти к расчётам", "Есептеулерге өту", "Go to calculations")}</Button>} /></Card>;

  const incomplete = overview.source_versions.filter((source) => !source.complete).length;
  return <div className={styles.snapshotGrid}>
    <Card title={t("Последний успешный расчёт", "Соңғы сәтті есептеу", "Latest successful calculation")} subtitle={t("Риски и избыток на одном сохранённом срезе", "Бір сақталған дерек кесіндісіндегі тәуекелдер мен артық қор", "Risks and excess stock in one saved snapshot")} actions={<Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => navigate(`/recommendations?${new URLSearchParams({ warehouse: run.warehouse_id, run: run.id })}`)}>{t("Открыть", "Ашу", "Open")}</Button>}>
      <dl className={styles.meta}>
        <div><dt>{t("Дата среза", "Дерек кесіндісінің күні", "Snapshot date")}</dt><dd>{new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "long" }).format(new Date(`${run.as_of}T12:00:00`))}</dd></div>
        <div><dt>{t("Склад", "Қойма", "Warehouse")}</dt><dd>{warehouseName}</dd></div>
        <div><dt>{t("Завершён", "Аяқталды", "Completed")}</dt><dd>{dateLabel(run.completed_at, locale)}</dd></div>
      </dl>
      <p className={styles.note}>{t("Показатели не суммируют разные расчёты и склады.", "Көрсеткіштер әртүрлі есептеулер мен қоймаларды қоспайды.", "Metrics do not combine different calculations or warehouses.")}</p>
    </Card>
    <Card title={t("Данные расчёта", "Есептеу деректері", "Calculation data")} subtitle={t("Версии источников, зафиксированные при запуске", "Іске қосқанда тіркелген дереккөз нұсқалары", "Source versions recorded when the run started")} actions={<Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={() => navigate("/data")}>{t("Источники", "Дереккөздер", "Sources")}</Button>}>
      {overview.source_versions.length ? <>
        <p className={styles.sourceSummary}>{overview.source_versions.length} {t("источников", "дереккөз", "sources")} · {incomplete ? `${incomplete} ${t("неполных", "толық емес", "incomplete")}` : t("все полные", "бәрі толық", "all complete")}</p>
        <ul className={styles.sources}>{overview.source_versions.map((source) => <li key={source.source_id}>
          <span>{t("Источник", "Дереккөз", "Source")} {source.source_id.slice(0, 8)} · {t("версия", "нұсқа", "version")} {source.revision}</span>
          <Badge tone={source.complete ? "success" : "warning"}>{source.complete ? t("Полный", "Толық", "Complete") : t("Неполный", "Толық емес", "Incomplete")}</Badge>
        </li>)}</ul>
      </> : <p className={styles.muted}>{t("Версии источников для этого расчёта не зафиксированы.", "Бұл есептеу үшін дереккөз нұсқалары тіркелмеген.", "No source versions were recorded for this calculation.")}</p>}
    </Card>
  </div>;
}

export function OverviewPage() {
  const { locale, t } = useI18n();
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
      if (!controller.signal.aborted) setError(errorText(caught, locale));
    }).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    });
    return () => controller.abort();
  }, [warehouseId, retry, locale]);

  const visibleOverview = loadedWarehouse === warehouseId ? overview : null;
  const run = visibleOverview?.latest_run;
  const warehouseName = warehouses.find((item) => item.id === run?.warehouse_id)?.name ?? (run ? `${t("Склад", "Қойма", "Warehouse")} ${run.warehouse_id.slice(0, 8)}` : "—");
  const warnings = visibleOverview?.warnings.filter((warning) => warning !== "no_successful_calculation") ?? [];

  return <section className={styles.page}>
    <PageHeader title={t("Обзор закупок", "Сатып алу шолуы", "Procurement overview")} subtitle={t("Что требует внимания по последнему расчёту", "Соңғы есеп бойынша назар аударуды қажет ететіндер", "What needs attention in the latest calculation")} actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} loading={refreshing} onClick={() => setRetry((value) => value + 1)}>{t("Обновить", "Жаңарту", "Refresh")}</Button>} />

    <div className={styles.toolbar}>
      <Select label={t("Склад", "Қойма", "Warehouse")} wrapperClassName={styles.warehouseSelect} id="overview-warehouse" value={warehouseId} onChange={(event) => {
        const next = new URLSearchParams(params);
        if (event.target.value) next.set("warehouse", event.target.value); else next.delete("warehouse");
        setParams(next);
      }}><option value="">{t("Последний расчёт по всем складам", "Барлық қойма бойынша соңғы есеп", "Latest calculation across all warehouses")}</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</Select>
      {warehouseError ? <span className={styles.muted}>{t("Названия складов недоступны; обзор всё ещё можно обновить.", "Қойма атаулары қолжетімсіз; шолуды бәрібір жаңартуға болады.", "Warehouse names are unavailable; you can still refresh the overview.")}</span> : null}
    </div>

    {loading && !visibleOverview ? <OverviewSkeleton /> : error && !visibleOverview ? <Alert tone="danger" title={t("Обзор недоступен", "Шолу қолжетімсіз", "Overview unavailable")} action={<Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>{t("Повторить", "Қайталау", "Try again")}</Button>}>{error}</Alert> : visibleOverview ? <div className={styles.content} aria-busy={refreshing}>
      {error ? <Alert tone="warning" title={t("Не удалось обновить обзор", "Шолуды жаңарту мүмкін болмады", "Could not refresh overview")}>{t("Показаны предыдущие данные.", "Алдыңғы деректер көрсетілді.", "Showing previous data.")} {error}</Alert> : null}
      <div className={styles.tiles}>
        <Tile label={t("Риск дефицита", "Тапшылық қаупі", "Shortage risk")} value={run ? visibleOverview.deficit_count : "—"} hint={t("Позиций в последнем расчёте", "Соңғы есептегі позициялар", "Items in the latest calculation")} tone={run && visibleOverview.deficit_count ? "up" : "default"} />
        <Tile label={t("Избыток", "Артық қор", "Excess stock")} value={run ? visibleOverview.excess_count : "—"} hint={t("Позиций с запасом выше потребности", "Қоры қажеттіліктен асатын позициялар", "Items with stock above demand")} tone={run && visibleOverview.excess_count ? "warn" : "default"} />
        <Tile label={t("Заблокировано", "Бұғатталған", "Blocked")} value={run ? visibleOverview.blocked_count : "—"} hint={t("Рекомендаций, требующих проверки", "Тексеруді қажет ететін ұсыныстар", "Recommendations needing review")} tone={run && visibleOverview.blocked_count ? "warn" : "default"} />
        <Tile label={t("Черновики заказов", "Тапсырыс жобалары", "Draft orders")} value={visibleOverview.draft_order_count} hint={t("Актуально на момент запроса", "Сұрау сәтіндегі жағдай", "As of this request")} tone="default" />
      </div>
      {warnings.length ? <Alert tone="warning" title={t("Ограничения расчёта", "Есептеу шектеулері", "Calculation limitations")}><ul className={styles.warnings}>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warningText[warning] ? translate(locale, ...warningText[warning]) : warning}</li>)}</ul></Alert> : null}
      <Snapshot overview={visibleOverview} warehouseName={warehouseName} />
      <div className={styles.nextSteps}>
        <h2>{t("Продолжить работу", "Жұмысты жалғастыру", "Continue working")}</h2>
        <div className={styles.actions}>
          <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={() => navigate(warehouseId ? `/recommendations?${new URLSearchParams({ warehouse: warehouseId })}` : "/recommendations")}>{t("Расчёты", "Есептеулер", "Calculations")}</Button>
          <Button variant="secondary" icon={<Boxes size={16} />} onClick={() => navigate(warehouseId ? `/inventory?${new URLSearchParams({ warehouse: warehouseId })}` : "/inventory")}>{t("Остатки склада", "Қойма қоры", "Warehouse stock")}</Button>
          <Button variant="secondary" icon={<ShoppingCart size={16} />} onClick={() => navigate("/orders")}>{t("Заказы поставщикам", "Жеткізушілерге тапсырыстар", "Supplier orders")}</Button>
          <Button variant="secondary" icon={<Database size={16} />} onClick={() => navigate("/data")}>{t("Источники данных", "Дереккөздер", "Data sources")}</Button>
        </div>
      </div>
    </div> : null}
  </section>;
}
