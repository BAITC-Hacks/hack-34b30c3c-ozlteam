import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Select, Table, Tabs, Td, Th, Tr } from "../../../shared/ui";
import { useCurrentUser } from "../../auth";
import { getCatalog, listCatalog } from "../api/catalogs";
import type { AnyCatalogRecord, CatalogKind, CategoryRecord, ProductRecord, WarehouseRecord } from "../api/catalogs";
import { dataQualityReason } from "../quality";
import { CatalogArchiveDialog, CatalogEditor } from "../components/CatalogEditor";
import styles from "./CatalogsPage.module.css";

const PAGE_SIZE = 50;
function recommendationReturn(input: string | null): string | null {
  if (!input || !input.startsWith("/") || input.startsWith("//")) return null;
  try {
    const url = new URL(input, window.location.origin);
    return url.origin === window.location.origin && /^\/recommendations\/[0-9a-f-]{36}$/i.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}
function dateText(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function quantity(value: string | number, locale: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 6 }).format(number) : String(value);
}

function orderCondition(product: ProductRecord, kind: "pack" | "minimum", locale: string, t: ReturnType<typeof useI18n>["t"]): string {
  const quality = product.data_quality;
  if (quality?.origin === "partner_workbook" && (!quality.supplier_terms_known || quality.supplier_terms_semantics !== kind)) return t("Не подтверждено", "Расталмаған", "Unconfirmed");
  return `${quantity(kind === "pack" ? product.pack_size : product.min_order_qty, locale)} ${product.unit}`;
}

function internalReturn(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !["/data/catalogs", "/data", "/orders", "/inventory", "/recommendations"].includes(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

function catalogLink(query: Record<string, string>, from: string): string {
  return `/data/catalogs?${new URLSearchParams({ ...query, from })}`;
}

function ProductQuality({ product }: { product: ProductRecord }) {
  const { t } = useI18n();
  const qualityNames = { ready: t("Готово", "Дайын", "Ready"), limited: t("С ограничениями", "Шектеулер бар", "Limited"), blocked: t("Нужно исправить", "Түзету қажет", "Needs correction") };
  const quality = product.data_quality;
  if (!quality?.status) return <p className={styles.muted}>{t("Готовность данных для этого товара ещё не оценена.", "Бұл тауардың деректер дайындығы әлі бағаланбаған.", "Data readiness for this product has not been assessed yet.")}</p>;
  return <Alert tone={quality.status === "blocked" ? "warning" : quality.status === "ready" ? "success" : "info"} title={qualityNames[quality.status]}>
    {quality.origin === "partner_workbook" ? <p>{t("Тестовые выгрузки 1С.", "1С тестілік деректер көшірмелері.", "Test exports from 1C.")}</p> : null}
    {quality.history_start ? <p>{t("Начало доступной истории", "Қолжетімді тарихтың басталуы", "Available history starts")}: {quality.history_start}.</p> : null}
    {quality.reasons?.length ? <ul className={styles.reasons}>{quality.reasons.map((reason) => <li key={reason}>{dataQualityReason(reason)}</li>)}</ul> : null}
  </Alert>;
}

function CatalogSkeleton({ detail = false }: { detail?: boolean }) {
  const { t } = useI18n();
  return <div className={styles.skeleton} aria-busy="true" aria-label={t("Загружаем справочник", "Анықтамалық жүктелуде", "Loading catalog")}>
    {Array.from({ length: detail ? 5 : 6 }, (_, index) => <div key={index} className={styles.skeletonRow} aria-hidden="true"><i /><i /><i /></div>)}
  </div>;
}

function RecordFields({ record, kind, category, supplier }: { record: AnyCatalogRecord; kind: CatalogKind; category: AnyCatalogRecord | null; supplier: AnyCatalogRecord | null }) {
  const { locale, t } = useI18n();
  const product = kind === "products" ? record as ProductRecord : null;
  const categoryRecord = kind === "categories" ? record as CategoryRecord : null;
  const warehouse = kind === "warehouses" ? record as WarehouseRecord : null;
  const fields: [string, string][] = [
    [t("Название", "Атауы", "Name"), record.name],
    [t("Статус", "Күйі", "Status"), record.active ? t("Активен", "Белсенді", "Active") : t("Неактивен", "Белсенді емес", "Inactive")],
    ...(product ? [
      [t("Артикул", "Артикул", "SKU"), product.sku],
      [t("Код", "Код", "Code"), product.code || "—"],
      [t("Категория", "Санат", "Category"), category?.name ?? product.category_id ?? t("Не указана", "Көрсетілмеген", "Not specified")],
      [t("Поставщик", "Жеткізуші", "Supplier"), supplier?.name ?? product.supplier_id ?? t("Не указан", "Көрсетілмеген", "Not specified")],
      [t("Единица", "Өлшем бірлігі", "Unit"), product.unit],
      [t("Срок поставки", "Жеткізу мерзімі", "Lead time"), product.lead_time_days === null ? t("Не указан", "Көрсетілмеген", "Not specified") : `${product.lead_time_days} ${t("дн.", "күн", "days")}`],
      [t("Кратность заказа", "Тапсырыс еселігі", "Order multiple"), orderCondition(product, "pack", locale, t)],
      [t("Минимальный заказ", "Ең аз тапсырыс", "Minimum order"), orderCondition(product, "minimum", locale, t)],
      [t("Характеристика 1С", "1С сипаттамасы", "1C characteristic"), product.characteristic_external_id || "—"],
    ] as [string, string][] : []),
    ...(categoryRecord ? [[t("Период проверки", "Тексеру кезеңі", "Review period"), `${categoryRecord.review_days} ${t("дн.", "күн", "days")}`], [t("Страховой запас", "Қауіпсіздік қоры", "Safety stock"), `${categoryRecord.safety_days} ${t("дн.", "күн", "days")}`]] as [string, string][] : []),
    ...(warehouse ? [[t("Организация 1С", "1С ұйымы", "1C organization"), warehouse.organization_external_id || "—"]] as [string, string][] : []),
    [t("Версия источника", "Дереккөз нұсқасы", "Source version"), String(record.source_revision)],
    [t("Обновлено в источнике", "Дереккөзде жаңартылды", "Updated at source"), dateText(record.source_updated_at, locale)],
    [t("Внешний ID", "Сыртқы ID", "External ID"), record.external_id],
    ["UUID", record.id],
  ];
  return <dl className={styles.fields}>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="is-selectable">{value}</dd></div>)}</dl>;
}

export function CatalogsPage() {
  const { locale, t } = useI18n();
  const { data: user } = useCurrentUser();
  const canWrite = Boolean(user?.permissions.includes("catalogs.write"));
  const [editor, setEditor] = useState<{ kind: CatalogKind; record?: AnyCatalogRecord } | null>(null);
  const [archive, setArchive] = useState<{ kind: CatalogKind; record: AnyCatalogRecord } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const kinds: { id: CatalogKind; label: string }[] = [
    { id: "products", label: t("Товары", "Тауарлар", "Products") },
    { id: "categories", label: t("Категории", "Санаттар", "Categories") },
    { id: "suppliers", label: t("Поставщики", "Жеткізушілер", "Suppliers") },
    { id: "warehouses", label: t("Склады", "Қоймалар", "Warehouses") },
  ];
  const qualityNames = { ready: t("Готово", "Дайын", "Ready"), limited: t("С ограничениями", "Шектеулер бар", "Limited"), blocked: t("Нужно исправить", "Түзету қажет", "Needs correction") };
  const errorText = (error: unknown): string => {
    if (error instanceof ApiError && error.status === 403) return t("У вашей роли нет доступа к справочникам.", "Сіздің рөліңізге анықтамалықтар қолжетімсіз.", "Your role cannot access catalogs.");
    if (error instanceof ApiError && error.status === 404) return t("Запись не найдена. Возможно, она удалена из источника.", "Жазба табылмады. Ол дереккөзден жойылған болуы мүмкін.", "Record not found. It may have been removed from the source.");
    return error instanceof Error ? error.message : t("Не удалось получить данные справочника.", "Анықтамалық деректерін алу мүмкін болмады.", "Could not load catalog data.");
  };
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const kind = kinds.find((item) => item.id === params.get("tab"))?.id ?? "products";
  const q = (params.get("q") ?? "").slice(0, 200);
  const active = ["true", "false"].includes(params.get("active") ?? "") ? params.get("active")! : "";
  const rawOffset = Number(params.get("offset") ?? "0");
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const id = params.get("id") ?? "";
  const supplierId = kind === "products" ? params.get("supplier_id") ?? "" : "";
  const sourceId = params.get("source_id") ?? "";
  const [search, setSearch] = useState(q);
  const searchTimer = useRef<number | null>(null);
  const [rows, setRows] = useState<AnyCatalogRecord[]>([]);
  const [listKey, setListKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedRecord, setRecord] = useState<AnyCatalogRecord | null>(null);
  const [detailKey, setDetailKey] = useState("");
  const [category, setCategory] = useState<AnyCatalogRecord | null>(null);
  const [supplier, setSupplier] = useState<AnyCatalogRecord | null>(null);
  const [filterSupplier, setFilterSupplier] = useState<AnyCatalogRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadedDetailError, setDetailError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const key = `${kind}:${q}:${active}:${offset}:${supplierId}:${sourceId}:${reload}`;
  const record = detailKey === `${kind}:${id}` && loadedRecord?.id === id ? loadedRecord : null;
  const detailError = detailKey === `${kind}:${id}` ? loadedDetailError : null;

  useEffect(() => { setSearch(q); }, [q]);

  useEffect(() => {
    if (id || search === q) return;
    const timer = window.setTimeout(() => {
      searchTimer.current = null;
      setParams((current) => {
        if (current.has("id")) return current;
        const next = new URLSearchParams(current);
        if (search.trim()) next.set("q", search.trim()); else next.delete("q");
        next.delete("offset");
        return next;
      }, { replace: true });
    }, 300);
    searchTimer.current = timer;
    return () => { window.clearTimeout(timer); if (searchTimer.current === timer) searchTimer.current = null; };
  }, [search, q, id, setParams]);

  useEffect(() => {
    if (id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listCatalog(kind, { q, active, offset, limit: PAGE_SIZE + 1, supplier_id: supplierId, source_id: sourceId }, controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setRows(value); setListKey(key); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, q, active, offset, supplierId, sourceId, reload, id, key, t]);

  useEffect(() => {
    setFilterSupplier(null);
    if (!supplierId) return;
    const controller = new AbortController();
    getCatalog("suppliers", supplierId, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setFilterSupplier(value); })
      .catch(() => { /* Фильтр остаётся видимым, даже если подпись недоступна. */ });
    return () => controller.abort();
  }, [supplierId]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setRecord(null);
    setCategory(null);
    setSupplier(null);
    setDetailLoading(true);
    setDetailError(null);
    getCatalog(kind, id, controller.signal)
      .then(async (value) => {
        if (controller.signal.aborted) return;
        setRecord(value);
        setDetailKey(`${kind}:${id}`);
        if (kind === "products") {
          const product = value as ProductRecord;
          const [categoryResult, supplierResult] = await Promise.all([
            product.category_id ? getCatalog("categories", product.category_id, controller.signal).catch(() => null) : Promise.resolve(null),
            product.supplier_id ? getCatalog("suppliers", product.supplier_id, controller.signal).catch(() => null) : Promise.resolve(null),
          ]);
          if (!controller.signal.aborted) { setCategory(categoryResult); setSupplier(supplierResult); }
        }
      })
      .catch((caught: unknown) => { if (!controller.signal.aborted) { setDetailError(errorText(caught)); setDetailKey(`${kind}:${id}`); } })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [kind, id, reload, t]);

  function updateParam(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "offset" && name !== "id") next.delete("offset");
    if (name !== "id") next.delete("id");
    if (name === "tab") { next.delete("supplier_id"); next.delete("from"); }
    setParams(next);
  }

  function closeDetail() {
    const back = recommendationReturn(params.get("from"));
    if (back) { navigate(back, { replace: true }); return; }
    const next = new URLSearchParams(params);
    next.delete("id");
    next.delete("from");
    const fallback = `/data/catalogs?${next}`;
    const destination = internalReturn(params.get("from"), fallback);
    navigate(destination === currentPath ? fallback : destination, { replace: true });
  }

  function openDetail(recordId: string) {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = null;
    const next = new URLSearchParams(params);
    const pendingSearch = search.trim();
    if (pendingSearch) next.set("q", pendingSearch); else next.delete("q");
    if (pendingSearch !== q) next.delete("offset");
    next.set("from", `${location.pathname}?${next}`);
    next.set("id", recordId);
    setParams(next);
  }

  const visibleRows = listKey === key ? rows.slice(0, PAGE_SIZE) : [];
  const hasNext = listKey === key && rows.length > PAGE_SIZE;

  function saved(savedRecord: AnyCatalogRecord) {
    const created = editor && !editor.record;
    setEditor(null); setArchive(null); setSavedNotice(true);
    setReload((value) => value + 1);
    if (created) openDetail(savedRecord.id);
  }

  return <div className={styles.page}>
    <PageHeader title={id ? t("Запись справочника", "Анықтамалық жазбасы", "Catalog record") : t("Справочники", "Анықтамалықтар", "Catalogs")} subtitle={t("Импортированные и ручные товары, категории, поставщики и склады", "Импортталған және қолмен енгізілген тауарлар, санаттар, жеткізушілер мен қоймалар", "Imported and manual products, categories, suppliers and warehouses")} actions={<><Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>{t("Обновить", "Жаңарту", "Refresh")}</Button>{canWrite && !id ? <Button size="sm" onClick={() => setEditor({ kind })}>{t("Добавить запись", "Жазба қосу", "Add record")}</Button> : null}</>} />
    {savedNotice ? <Alert tone="success" onDismiss={() => setSavedNotice(false)} title={t("Сохранено", "Сақталды", "Saved")}>{t("Справочник обновлён.", "Анықтамалық жаңартылды.", "The catalog has been updated.")}</Alert> : null}
    {id ? <Card title={record?.name ?? t("Карточка справочника", "Анықтамалық карточкасы", "Catalog record")} actions={<Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={closeDetail}>{recommendationReturn(params.get("from")) ? t("К рекомендации", "Ұсынымға", "To recommendation") : t("К списку", "Тізімге", "To list")}</Button>}>
      {detailError ? <ErrorState title={t("Не удалось открыть запись", "Жазбаны ашу мүмкін болмады", "Could not open record")} text={detailError} onRetry={() => setReload((value) => value + 1)} /> : detailLoading || !record ? <CatalogSkeleton detail /> : <div className={styles.detail}>
        {canWrite ? <div className={styles.related}><Button variant="secondary" size="sm" onClick={() => setEditor({ kind, record })}>{t("Изменить", "Өзгерту", "Edit")}</Button><Button variant="secondary" size="sm" onClick={() => setArchive({ kind, record })}>{record.active ? t("В архив", "Мұрағатқа", "Archive") : t("Восстановить", "Қалпына келтіру", "Restore")}</Button></div> : null}
        {kind === "products" ? <ProductQuality product={record as ProductRecord} /> : null}
        <RecordFields record={record} kind={kind} category={category} supplier={supplier} />
        {kind === "suppliers" ? <nav className={styles.related} aria-label={t("Данные поставщика", "Жеткізуші деректері", "Supplier data")}><Link to={catalogLink({ tab: "products", supplier_id: record.id, source_id: record.source_id }, currentPath)}>{t("Товары поставщика", "Жеткізушінің тауарлары", "Supplier products")}</Link><Link to={`/orders?${new URLSearchParams({ supplier_id: record.id, from: currentPath })}`}>{t("Заказы поставщику", "Жеткізушіге тапсырыстар", "Supplier orders")}</Link></nav> : null}
        {kind === "products" && (record as ProductRecord).supplier_id ? <nav className={styles.related} aria-label={t("Связанные данные товара", "Тауарға қатысты деректер", "Related product data")}><Link to={catalogLink({ tab: "suppliers", id: (record as ProductRecord).supplier_id! }, currentPath)}>{t("Поставщик", "Жеткізуші", "Supplier")}: {supplier?.name ?? t("открыть карточку", "карточканы ашу", "open record")}</Link><Link to={`/orders?${new URLSearchParams({ supplier_id: (record as ProductRecord).supplier_id!, from: currentPath })}`}>{t("Заказы поставщику", "Жеткізушіге тапсырыстар", "Supplier orders")}</Link></nav> : null}
      </div>}
    </Card> : <Card title={t("Записи справочников", "Анықтамалық жазбалары", "Catalog records")} subtitle={t("Поиск по названию, для товаров также по артикулу", "Атауы бойынша іздеу, тауарлар үшін артикул бойынша да", "Search by name, or by SKU for products")}>
      <Tabs items={kinds} value={kind} onValueChange={(value) => updateParam("tab", value)} ariaLabel={t("Справочник", "Анықтамалық", "Catalog")} />
      {supplierId ? <div className={styles.filterNotice}><span>{t("Товары поставщика", "Жеткізушінің тауарлары", "Supplier products")}: <strong>{filterSupplier?.name ?? supplierId}</strong></span><Link to={catalogLink({ tab: "suppliers", id: supplierId }, currentPath)}>{t("Карточка поставщика", "Жеткізуші карточкасы", "Supplier record")}</Link><Button variant="ghost" size="sm" onClick={() => updateParam("supplier_id", "")}>{t("Все поставщики", "Барлық жеткізушілер", "All suppliers")}</Button></div> : null}
      <div className={styles.filters}>
        <label>{t("Поиск", "Іздеу", "Search")}<input type="search" value={search} maxLength={200} placeholder={kind === "products" ? t("Название или артикул", "Атауы немесе артикулы", "Name or SKU") : t("Название", "Атауы", "Name")} onChange={(event) => setSearch(event.target.value)} /></label>
        <Select label={t("Статус", "Күйі", "Status")} value={active} onChange={(event) => updateParam("active", event.target.value)}><option value="">{t("Все", "Барлығы", "All")}</option><option value="true">{t("Активные", "Белсенді", "Active")}</option><option value="false">{t("Неактивные", "Белсенді емес", "Inactive")}</option></Select>
      </div>
      {error ? <ErrorState title={t("Не удалось загрузить справочник", "Анықтамалықты жүктеу мүмкін болмады", "Could not load catalog")} text={error} onRetry={() => setReload((value) => value + 1)} /> : loading && listKey !== key ? <CatalogSkeleton /> : <div aria-busy={loading}>
        {visibleRows.length === 0 ? <EmptyState title={t("Записей пока нет", "Әзірге жазбалар жоқ", "No records yet")} text={q || active || supplierId ? t("Измените поиск или фильтры.", "Іздеуді немесе сүзгілерді өзгертіңіз.", "Change the search or filters.") : t("Загрузите справочники из 1С.", "Анықтамалықтарды 1С-тен жүктеңіз.", "Import catalogs from 1C.")} /> : <Table><thead><Tr><Th>{t("Название", "Атауы", "Name")}</Th>{kind === "products" ? <><Th>{t("Артикул", "Артикул", "SKU")}</Th><Th>{t("Готовность", "Дайындық", "Readiness")}</Th><Th numeric>{t("Кратность", "Еселік", "Multiple")}</Th><Th numeric>{t("Мин. заказ", "Ең аз тапсырыс", "Min. order")}</Th><Th numeric>{t("Срок", "Мерзім", "Lead time")}</Th></> : null}{kind === "categories" ? <><Th numeric>{t("Проверка", "Тексеру", "Review")}</Th><Th numeric>{t("Страховой запас", "Қауіпсіздік қоры", "Safety stock")}</Th></> : null}{kind === "warehouses" ? <Th>{t("Организация 1С", "1С ұйымы", "1C organization")}</Th> : null}<Th>{t("Статус", "Күйі", "Status")}</Th><Th numeric>{t("Версия", "Нұсқа", "Version")}</Th></Tr></thead><tbody>{visibleRows.map((row) => {
          const product = kind === "products" ? row as ProductRecord : null;
          const categoryRow = kind === "categories" ? row as CategoryRecord : null;
          const warehouse = kind === "warehouses" ? row as WarehouseRecord : null;
          return <Tr key={row.id}><Td><button type="button" className={styles.recordLink} onClick={() => openDetail(row.id)}>{row.name}</button></Td>{product ? <><Td>{product.sku}<small className={styles.muted}>{product.code ?? ""}</small></Td><Td>{product.data_quality?.status ? <Badge tone={product.data_quality.status === "ready" ? "success" : "warning"}>{qualityNames[product.data_quality.status]}</Badge> : t("Не оценена", "Бағаланбаған", "Not assessed")}</Td><Td numeric>{orderCondition(product, "pack", locale, t)}</Td><Td numeric>{orderCondition(product, "minimum", locale, t)}</Td><Td numeric>{product.lead_time_days === null ? "—" : `${product.lead_time_days} ${t("дн.", "күн", "days")}`}</Td></> : null}{categoryRow ? <><Td numeric>{categoryRow.review_days} {t("дн.", "күн", "days")}</Td><Td numeric>{categoryRow.safety_days} {t("дн.", "күн", "days")}</Td></> : null}{warehouse ? <Td>{warehouse.organization_external_id ?? "—"}</Td> : null}<Td>{row.active ? t("Активен", "Белсенді", "Active") : t("Неактивен", "Белсенді емес", "Inactive")}</Td><Td numeric>{row.source_revision}</Td></Tr>;
        })}</tbody></Table>}
        <div className={styles.pager}><span>{visibleRows.length ? `${t("Записи", "Жазбалар", "Records")} ${offset + 1}–${offset + visibleRows.length}` : `${t("Записи с", "Жазбалар", "Records from")} ${offset + 1}`}{loading ? ` · ${t("обновляем", "жаңартылуда", "updating")}` : ""}</span><div><Button variant="secondary" size="sm" disabled={loading || offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - PAGE_SIZE)))}>{t("Назад", "Артқа", "Previous")}</Button><Button variant="secondary" size="sm" disabled={loading || !hasNext} onClick={() => updateParam("offset", String(offset + PAGE_SIZE))}>{t("Далее", "Келесі", "Next")}</Button></div></div>
      </div>}
    </Card>}
    {editor && canWrite ? <CatalogEditor kind={editor.kind} record={editor.record} onClose={() => setEditor(null)} onSaved={saved} /> : null}
    {archive && canWrite ? <CatalogArchiveDialog kind={archive.kind} record={archive.record} onClose={() => setArchive(null)} onSaved={saved} /> : null}
  </div>;
}
