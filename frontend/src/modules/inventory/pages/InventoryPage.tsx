import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { Button, Card, EmptyState, ErrorState, Select, Table, Tabs, Td, Th, Tr } from "../../../shared/ui";
import { getCatalogRecord, listCatalog, listInventory } from "../api/inventory";
import type { CatalogRow, GrowthRow, InboundRow, InventoryKind, SaleRow, StockoutRow, StockRow } from "../api/inventory";
import styles from "./InventoryPage.module.css";

const PAGE_SIZE = 50;
function returnToRecommendation(input: string | null): string {
  if (!input || !input.startsWith("/") || input.startsWith("//")) return "/recommendations";
  try {
    const url = new URL(input, window.location.origin);
    return url.origin === window.location.origin && /^\/recommendations\/[0-9a-f-]{36}$/i.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}` : "/recommendations";
  } catch { return "/recommendations"; }
}
const kinds: { id: InventoryKind; title: string; description: string }[] = [
  { id: "stocks", title: "Остатки", description: "Последний снимок по каждому товару и складу. Остаток включает резерв." },
  { id: "inbound", title: "В пути", description: "Загруженные записи о поставках. В расчёт попадают только подтверждённые и находящиеся в пути." },
  { id: "stockouts", title: "Отсутствие", description: "Зафиксированные интервалы отсутствия товара. Статус показывает, учитывается ли запись." },
  { id: "sales", title: "Продажи", description: "Загруженные отгрузки клиентам. Отменённые документы видны для проверки, но не участвуют в расчёте." },
  { id: "stock_history", title: "История остатков", description: "Все загруженные снимки остатков, включая более ранние даты." },
  { id: "growth", title: "Прирост спроса", description: "Прогноз по товару или категории. Неактивные записи видны для проверки, но не участвуют в расчёте." },
];

function describeError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "У вашей роли нет доступа к данным запасов.";
  return error instanceof Error ? error.message : "Не удалось получить данные.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatQuantity(value: string): string {
  const [whole, decimal] = value.split(".");
  const grouped = new Intl.NumberFormat("ru-RU").format(BigInt(whole || "0"));
  const fraction = decimal?.replace(/0+$/, "");
  return fraction ? `${grouped},${fraction}` : grouped;
}

function inboundStatus(status: string): string {
  return ({ confirmed: "Подтверждена", in_transit: "В пути", received: "Получена", cancelled: "Отменена" } as Record<string, string>)[status] ?? status;
}

function InventorySkeleton() {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем данные запасов">
    {Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.skeletonRow} aria-hidden="true"><i /><i /><i /><i /></div>)}
  </div>;
}

export function InventoryPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = kinds.find((item) => item.id === params.get("tab"))?.id ?? "stocks";
  const warehouseId = params.get("warehouse") ?? "";
  const productId = params.get("product") ?? "";
  const rawOffset = Number(params.get("offset") ?? "0");
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const [warehouses, setWarehouses] = useState<CatalogRow[]>([]);
  const [products, setProducts] = useState<CatalogRow[]>([]);
  const [suppliers, setSuppliers] = useState<CatalogRow[]>([]);
  const [categories, setCategories] = useState<CatalogRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [rows, setRows] = useState<StockRow[] | InboundRow[] | StockoutRow[] | SaleRow[] | GrowthRow[]>([]);
  const productDetails = useRef(new Map<string, CatalogRow>());
  const [productDetailsVersion, setProductDetailsVersion] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    Promise.all([
      listCatalog("warehouses", "", controller.signal),
      listCatalog("suppliers", "", controller.signal),
      listCatalog("categories", "", controller.signal),
    ]).then(([warehouseRows, supplierRows, categoryRows]) => {
      setWarehouses(warehouseRows);
      setSuppliers(supplierRows);
      setCategories(categoryRows);
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setCatalogError(describeError(caught)); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      listCatalog("products", productSearch.trim(), controller.signal)
        .then(async (found) => {
          if (productId && !found.some((item) => item.id === productId)) {
            try { found = [await getCatalogRecord("products", productId, controller.signal), ...found]; }
            catch { /* Сохранённый фильтр останется доступен по UUID. */ }
          }
          if (!controller.signal.aborted) {
            found.forEach((product) => productDetails.current.set(product.id, product));
            setProductDetailsVersion((value) => value + 1);
            setProducts(found);
            setCatalogError(null);
          }
        })
        .catch((caught: unknown) => { if (!controller.signal.aborted) setCatalogError(describeError(caught)); });
    }, productSearch ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [productSearch, productId, reload]);

  const dataKey = `${tab}:${warehouseId}:${productId}:${offset}`;

  useEffect(() => {
    const controller = new AbortController();
    const filters = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (tab !== "growth" && warehouseId) filters.set("warehouse_id", warehouseId);
    if (tab !== "growth" && productId) filters.set("product_id", productId);
    setLoading(true);
    setError(null);
    listInventory(tab, filters, controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setRows(value); setLoadedKey(dataKey); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(describeError(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, warehouseId, productId, offset, reload, dataKey]);

  useEffect(() => {
    if (loadedKey !== dataKey) return;
    const knownIds = new Set(products.map((item) => item.id));
    const missingIds = [...new Set(rows.flatMap((row) => row.product_id ? [row.product_id] : []))]
      .filter((id) => !knownIds.has(id) && !productDetails.current.has(id));
    if (missingIds.length === 0) return;

    const controller = new AbortController();
    let next = 0;
    async function loadMissingProducts() {
      while (next < missingIds.length && !controller.signal.aborted) {
        const id = missingIds[next++];
        try {
          const product = await getCatalogRecord("products", id, controller.signal);
          if (!controller.signal.aborted) {
            productDetails.current.set(id, product);
            setProductDetailsVersion((value) => value + 1);
          }
        } catch { /* Если запись недоступна, оставляем её UUID до следующего обновления. */ }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, missingIds.length) }, () => loadMissingProducts()));
    return () => controller.abort();
  }, [rows, products, loadedKey, dataKey, reload]);

  const productById = useMemo(() => new Map([...productDetails.current, ...products.map((item) => [item.id, item] as const)]), [products, productDetailsVersion]);
  const warehouseById = useMemo(() => new Map(warehouses.map((item) => [item.id, item.name])), [warehouses]);
  const supplierById = useMemo(() => new Map(suppliers.map((item) => [item.id, item.name])), [suppliers]);
  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "offset") next.delete("offset");
    setParams(next);
  }

  function productLabel(id: string): string {
    const product = productById.get(id);
    return product ? `${product.name}${product.sku ? ` · ${product.sku}` : ""}` : id;
  }

  function warehouseLabel(id: string): string { return warehouseById.get(id) ?? id; }
  function unit(id: string): string { return productById.get(id)?.unit ?? ""; }
  function growthRate(value: string): string {
    const percent = Number(value) * 100;
    return Number.isFinite(percent) ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(percent)} %` : value;
  }

  const title = kinds.find((item) => item.id === tab)!;
  const hasRows = loadedKey === dataKey && rows.length > 0;

  return <div className={styles.page}>
    <PageHeader title="Запасы и спрос" subtitle="Загруженные остатки, поставки, продажи и прогноз прироста" actions={<>{params.has("from") ? <Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={() => navigate(returnToRecommendation(params.get("from")), { replace: true })}>К рекомендации</Button> : null}<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>Обновить</Button></>} />

    <Card title="Данные о товарах" subtitle="Выберите склад и товар, чтобы уточнить список">
      <div className={styles.filters}>
        <Select label="Склад" value={warehouseId} onChange={(event) => updateParam("warehouse", event.target.value)}><option value="">Все склады</option>{warehouseId && !warehouses.some((item) => item.id === warehouseId) ? <option value={warehouseId}>{warehouseId}</option> : null}{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <label>Поиск товара<input type="search" value={productSearch} maxLength={200} onChange={(event) => setProductSearch(event.target.value)} placeholder="Название или артикул" /></label>
        <Select label="Товар" value={productId} onChange={(event) => updateParam("product", event.target.value)}><option value="">Все товары</option>{productId && !products.some((item) => item.id === productId) ? <option value={productId}>{productId}</option> : null}{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}</Select>
      </div>
      {catalogError ? <p className={styles.catalogError} role="alert">Справочники не загрузились: {catalogError} <button type="button" onClick={() => setReload((value) => value + 1)}>Повторить</button></p> : null}
      <p className={styles.hint}>Поиск товара выполняется в загруженном справочнике. Если результатов больше 200, уточните запрос. Вкладка «Прирост спроса» показывает прогнозы и по категориям, поэтому фильтры склада и товара на неё не влияют.</p>
    </Card>

    <Card title={title.title} subtitle={title.description}>
      <Tabs items={kinds.map((item) => ({ id: item.id, label: item.title }))} value={tab} onValueChange={(value) => updateParam("tab", value)} ariaLabel="Вид данных" />
      {error ? <ErrorState title="Не удалось загрузить запасы" text={error} onRetry={() => setReload((value) => value + 1)} /> : (loading || loadedKey !== dataKey) && !hasRows ? <InventorySkeleton /> : <div aria-busy={loading}>
        {!hasRows ? <EmptyState title="Данных пока нет" text="Измените фильтры или загрузите данные." /> : <>
        {tab === "stocks" ? <Table><thead><Tr><Th>Товар</Th><Th>Склад</Th><Th numeric>Остаток</Th><Th numeric>Резерв</Th><Th>Снимок</Th></Tr></thead><tbody>{(rows as StockRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td numeric>{formatQuantity(row.reserved)} {unit(row.product_id)}</Td><Td>{formatDate(row.as_of)}</Td></Tr>)}</tbody></Table> : null}
        {tab === "inbound" ? <Table><thead><Tr><Th>Товар</Th><Th>Склад</Th><Th>Поставщик</Th><Th numeric>Количество</Th><Th>Ожидается</Th><Th>Статус</Th></Tr></thead><tbody>{(rows as InboundRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong><small className={styles.secondary}>Документ {row.document_id}</small></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td>{row.supplier_id ? supplierById.get(row.supplier_id) ?? row.supplier_id : "—"}</Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td>{formatDate(row.expected_date)}</Td><Td>{inboundStatus(row.status)}</Td></Tr>)}</tbody></Table> : null}
        {tab === "stockouts" ? <Table><thead><Tr><Th>Товар</Th><Th>Склад</Th><Th>Начало</Th><Th>Конец</Th><Th>Статус записи</Th></Tr></thead><tbody>{(rows as StockoutRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td>{formatDate(row.start)}</Td><Td>{row.end ? formatDate(row.end) : "Не указан"}</Td><Td>{row.active ? "Учитывается" : "Неактивна"}</Td></Tr>)}</tbody></Table> : null}
        {tab === "sales" ? <Table><thead><Tr><Th>Дата</Th><Th>Товар</Th><Th>Склад</Th><Th>Документ</Th><Th numeric>Количество</Th><Th>Статус</Th></Tr></thead><tbody>{(rows as SaleRow[]).map((row) => <Tr key={row.id}><Td>{formatDate(row.date)}</Td><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td>{row.document_id}<small className={styles.secondary}>Строка {row.line_id}</small></Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td>{row.status === "posted" ? "Проведена" : row.status === "cancelled" ? "Отменена" : row.status}</Td></Tr>)}</tbody></Table> : null}
        {tab === "stock_history" ? <Table><thead><Tr><Th>Товар</Th><Th>Склад</Th><Th numeric>Остаток</Th><Th numeric>Резерв</Th><Th>Дата снимка</Th></Tr></thead><tbody>{(rows as StockRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td numeric>{formatQuantity(row.reserved)} {unit(row.product_id)}</Td><Td>{formatDateTime(row.as_of)}</Td></Tr>)}</tbody></Table> : null}
        {tab === "growth" ? <Table><thead><Tr><Th>Объект прогноза</Th><Th>Период</Th><Th numeric>Прирост</Th><Th>Применение</Th><Th>Статус записи</Th></Tr></thead><tbody>{(rows as GrowthRow[]).map((row) => <Tr key={row.id}><Td><strong>{row.product_id ? productLabel(row.product_id) : row.category_id ? `Категория: ${categoryById.get(row.category_id) ?? row.category_id}` : "Объект не указан"}</strong></Td><Td>{formatDate(row.start)} — {formatDate(row.end)}</Td><Td numeric>{growthRate(row.rate)}</Td><Td>{row.mode === "additional" ? "Дополнительно к тренду" : row.mode === "replace_trend" ? "Вместо тренда" : row.mode}</Td><Td>{row.active ? "Учитывается" : "Неактивна"}</Td></Tr>)}</tbody></Table> : null}
        </>}
        <div className={styles.pager}><span>{hasRows ? `Записи ${offset + 1}–${offset + rows.length}` : "Записей на странице нет"}{loading ? " · обновляем" : ""}</span><div><Button variant="secondary" size="sm" disabled={loading || offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - PAGE_SIZE)))}>Назад</Button><Button variant="secondary" size="sm" disabled={loading || !hasRows || rows.length < PAGE_SIZE} onClick={() => updateParam("offset", String(offset + PAGE_SIZE))}>Далее</Button></div></div>
      </div>}
    </Card>
  </div>;
}
