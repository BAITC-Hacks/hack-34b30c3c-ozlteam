import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Select, Table, Tabs, Td, Th, Tr } from "../../../shared/ui";
import { getCatalog, listCatalog } from "../api/catalogs";
import type { AnyCatalogRecord, CatalogKind, CategoryRecord, ProductRecord, WarehouseRecord } from "../api/catalogs";
import { dataQualityReason } from "../quality";
import styles from "./CatalogsPage.module.css";

const PAGE_SIZE = 50;
const qualityNames = { ready: "Готово", limited: "С ограничениями", blocked: "Нужно исправить" } as const;
function recommendationReturn(input: string | null): string | null {
  if (!input || !input.startsWith("/") || input.startsWith("//")) return null;
  try {
    const url = new URL(input, window.location.origin);
    return url.origin === window.location.origin && /^\/recommendations\/[0-9a-f-]{36}$/i.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}
const kinds: { id: CatalogKind; label: string }[] = [
  { id: "products", label: "Товары" },
  { id: "categories", label: "Категории" },
  { id: "suppliers", label: "Поставщики" },
  { id: "warehouses", label: "Склады" },
];

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "У вашей роли нет доступа к справочникам.";
  if (error instanceof ApiError && error.status === 404) return "Запись не найдена. Возможно, она удалена из источника.";
  return error instanceof Error ? error.message : "Не удалось получить данные справочника.";
}

function dateText(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function quantity(value: string | number): string {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(number) : String(value);
}

function orderCondition(product: ProductRecord, kind: "pack" | "minimum"): string {
  const quality = product.data_quality;
  if (quality?.origin === "partner_workbook" && (!quality.supplier_terms_known || quality.supplier_terms_semantics !== kind)) return "Не подтверждено";
  return `${quantity(kind === "pack" ? product.pack_size : product.min_order_qty)} ${product.unit}`;
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
  const quality = product.data_quality;
  if (!quality?.status) return <p className={styles.muted}>Готовность данных для этого товара ещё не оценена.</p>;
  return <Alert tone={quality.status === "blocked" ? "warning" : quality.status === "ready" ? "success" : "info"} title={qualityNames[quality.status]}>
    {quality.origin === "partner_workbook" ? <p>Тестовые выгрузки 1С.</p> : null}
    {quality.history_start ? <p>Начало доступной истории: {quality.history_start}.</p> : null}
    {quality.reasons?.length ? <ul className={styles.reasons}>{quality.reasons.map((reason) => <li key={reason}>{dataQualityReason(reason)}</li>)}</ul> : null}
  </Alert>;
}

function CatalogSkeleton({ detail = false }: { detail?: boolean }) {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем справочник">
    {Array.from({ length: detail ? 5 : 6 }, (_, index) => <div key={index} className={styles.skeletonRow} aria-hidden="true"><i /><i /><i /></div>)}
  </div>;
}

function RecordFields({ record, kind, category, supplier }: { record: AnyCatalogRecord; kind: CatalogKind; category: AnyCatalogRecord | null; supplier: AnyCatalogRecord | null }) {
  const product = kind === "products" ? record as ProductRecord : null;
  const categoryRecord = kind === "categories" ? record as CategoryRecord : null;
  const warehouse = kind === "warehouses" ? record as WarehouseRecord : null;
  const fields: [string, string][] = [
    ["Название", record.name],
    ["Статус", record.active ? "Активен" : "Неактивен"],
    ...(product ? [
      ["Артикул", product.sku],
      ["Код", product.code || "—"],
      ["Категория", category?.name ?? product.category_id ?? "Не указана"],
      ["Поставщик", supplier?.name ?? product.supplier_id ?? "Не указан"],
      ["Единица", product.unit],
      ["Срок поставки", product.lead_time_days === null ? "Не указан" : `${product.lead_time_days} дн.`],
      ["Кратность заказа", orderCondition(product, "pack")],
      ["Минимальный заказ", orderCondition(product, "minimum")],
      ["Характеристика 1С", product.characteristic_external_id || "—"],
    ] as [string, string][] : []),
    ...(categoryRecord ? [["Период проверки", `${categoryRecord.review_days} дн.`], ["Страховой запас", `${categoryRecord.safety_days} дн.`]] as [string, string][] : []),
    ...(warehouse ? [["Организация 1С", warehouse.organization_external_id || "—"]] as [string, string][] : []),
    ["Версия источника", String(record.source_revision)],
    ["Обновлено в источнике", dateText(record.source_updated_at)],
    ["Внешний ID", record.external_id],
    ["UUID", record.id],
  ];
  return <dl className={styles.fields}>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="is-selectable">{value}</dd></div>)}</dl>;
}

export function CatalogsPage() {
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
  }, [kind, q, active, offset, supplierId, sourceId, reload, id, key]);

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
  }, [kind, id, reload]);

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

  return <div className={styles.page}>
    <PageHeader title={id ? "Запись справочника" : "Справочники"} subtitle={id ? "Данные из последней загрузки 1С" : "Товары, категории, поставщики и склады из 1С"} actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>Обновить</Button>} />
    {id ? <Card title={record?.name ?? "Карточка справочника"} actions={<Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={closeDetail}>{recommendationReturn(params.get("from")) ? "К рекомендации" : "К списку"}</Button>}>
      {detailError ? <ErrorState title="Не удалось открыть запись" text={detailError} onRetry={() => setReload((value) => value + 1)} /> : detailLoading || !record ? <CatalogSkeleton detail /> : <div className={styles.detail}>
        {kind === "products" ? <ProductQuality product={record as ProductRecord} /> : null}
        <RecordFields record={record} kind={kind} category={category} supplier={supplier} />
        {kind === "suppliers" ? <nav className={styles.related} aria-label="Данные поставщика"><Link to={catalogLink({ tab: "products", supplier_id: record.id, source_id: record.source_id }, currentPath)}>Товары поставщика</Link><Link to={`/orders?${new URLSearchParams({ supplier_id: record.id, from: currentPath })}`}>Заказы поставщику</Link></nav> : null}
        {kind === "products" && (record as ProductRecord).supplier_id ? <nav className={styles.related} aria-label="Связанные данные товара"><Link to={catalogLink({ tab: "suppliers", id: (record as ProductRecord).supplier_id! }, currentPath)}>Поставщик: {supplier?.name ?? "открыть карточку"}</Link><Link to={`/orders?${new URLSearchParams({ supplier_id: (record as ProductRecord).supplier_id!, from: currentPath })}`}>Заказы поставщику</Link></nav> : null}
      </div>}
    </Card> : <Card title="Данные 1С" subtitle="Поиск по названию, для товаров также по артикулу">
      <Tabs items={kinds} value={kind} onValueChange={(value) => updateParam("tab", value)} ariaLabel="Справочник" />
      {supplierId ? <div className={styles.filterNotice}><span>Товары поставщика: <strong>{filterSupplier?.name ?? supplierId}</strong></span><Link to={catalogLink({ tab: "suppliers", id: supplierId }, currentPath)}>Карточка поставщика</Link><Button variant="ghost" size="sm" onClick={() => updateParam("supplier_id", "")}>Все поставщики</Button></div> : null}
      <div className={styles.filters}>
        <label>Поиск<input type="search" value={search} maxLength={200} placeholder={kind === "products" ? "Название или артикул" : "Название"} onChange={(event) => setSearch(event.target.value)} /></label>
        <Select label="Статус" value={active} onChange={(event) => updateParam("active", event.target.value)}><option value="">Все</option><option value="true">Активные</option><option value="false">Неактивные</option></Select>
      </div>
      {error ? <ErrorState title="Не удалось загрузить справочник" text={error} onRetry={() => setReload((value) => value + 1)} /> : loading && listKey !== key ? <CatalogSkeleton /> : <div aria-busy={loading}>
        {visibleRows.length === 0 ? <EmptyState title="Записей пока нет" text={q || active || supplierId ? "Измените поиск или фильтры." : "Загрузите справочники из 1С."} /> : <Table><thead><Tr><Th>Название</Th>{kind === "products" ? <><Th>Артикул</Th><Th>Готовность</Th><Th numeric>Кратность</Th><Th numeric>Мин. заказ</Th><Th numeric>Срок</Th></> : null}{kind === "categories" ? <><Th numeric>Проверка</Th><Th numeric>Страховой запас</Th></> : null}{kind === "warehouses" ? <Th>Организация 1С</Th> : null}<Th>Статус</Th><Th numeric>Версия</Th></Tr></thead><tbody>{visibleRows.map((row) => {
          const product = kind === "products" ? row as ProductRecord : null;
          const categoryRow = kind === "categories" ? row as CategoryRecord : null;
          const warehouse = kind === "warehouses" ? row as WarehouseRecord : null;
          return <Tr key={row.id}><Td><button type="button" className={styles.recordLink} onClick={() => openDetail(row.id)}>{row.name}</button></Td>{product ? <><Td>{product.sku}<small className={styles.muted}>{product.code ?? ""}</small></Td><Td>{product.data_quality?.status ? <Badge tone={product.data_quality.status === "ready" ? "success" : "warning"}>{qualityNames[product.data_quality.status]}</Badge> : "Не оценена"}</Td><Td numeric>{orderCondition(product, "pack")}</Td><Td numeric>{orderCondition(product, "minimum")}</Td><Td numeric>{product.lead_time_days === null ? "—" : `${product.lead_time_days} дн.`}</Td></> : null}{categoryRow ? <><Td numeric>{categoryRow.review_days} дн.</Td><Td numeric>{categoryRow.safety_days} дн.</Td></> : null}{warehouse ? <Td>{warehouse.organization_external_id ?? "—"}</Td> : null}<Td>{row.active ? "Активен" : "Неактивен"}</Td><Td numeric>{row.source_revision}</Td></Tr>;
        })}</tbody></Table>}
        <div className={styles.pager}><span>{visibleRows.length ? `Записи ${offset + 1}–${offset + visibleRows.length}` : `Записи с ${offset + 1}`}{loading ? " · обновляем" : ""}</span><div><Button variant="secondary" size="sm" disabled={loading || offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - PAGE_SIZE)))}>Назад</Button><Button variant="secondary" size="sm" disabled={loading || !hasNext} onClick={() => updateParam("offset", String(offset + PAGE_SIZE))}>Далее</Button></div></div>
      </div>}
    </Card>}
  </div>;
}
