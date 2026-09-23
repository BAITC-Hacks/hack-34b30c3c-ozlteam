import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { useI18n } from "../../../shared/i18n/I18nContext";
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
function describeError(error: unknown, t: ReturnType<typeof useI18n>["t"]): string {
  if (error instanceof ApiError && error.status === 403) return t("У вашей роли нет доступа к данным запасов.", "Бұл рөлге қор деректері қолжетімсіз.", "Your role cannot access stock data.");
  return error instanceof Error ? error.message : t("Не удалось получить данные.", "Деректер алынбады.", "Could not load data.");
}

function formatDate(value: string, locale = "ru"): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value: string, locale = "ru"): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatQuantity(value: string): string {
  const [whole, decimal] = value.split(".");
  const grouped = new Intl.NumberFormat("ru-RU").format(BigInt(whole || "0"));
  const fraction = decimal?.replace(/0+$/, "");
  return fraction ? `${grouped},${fraction}` : grouped;
}

function InventorySkeleton() {
  const { t } = useI18n();
  return <div className={styles.skeleton} aria-busy="true" aria-label={t("Загружаем данные запасов", "Қор деректері жүктелуде", "Loading stock data")}>
    {Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.skeletonRow} aria-hidden="true"><i /><i /><i /><i /></div>)}
  </div>;
}

export function InventoryPage() {
  const { t, locale } = useI18n();
  const inboundStatus = (status: string) => ({ confirmed: t("Подтверждена", "Расталған", "Confirmed"), in_transit: t("В пути", "Жолда", "In transit"), received: t("Получена", "Алынған", "Received"), cancelled: t("Отменена", "Күші жойылған", "Cancelled") } as Record<string, string>)[status] ?? status;
  const kinds: { id: InventoryKind; title: string; description: string }[] = [
    { id: "stocks", title: t("Остатки", "Қалдықтар", "Stock"), description: t("Последний снимок по каждому товару и складу. Остаток включает резерв.", "Әр тауар мен қойма бойынша соңғы дерек. Қалдыққа резерв кіреді.", "Latest snapshot for each product and warehouse. Stock includes reserved units.") },
    { id: "inbound", title: t("В пути", "Жолда", "Inbound"), description: t("Загруженные записи о поставках. В расчёт попадают только подтверждённые и находящиеся в пути.", "Жүктелген жеткізілімдер. Есепке тек расталған және жолдағы жеткізілімдер кіреді.", "Imported deliveries. Only confirmed and in transit deliveries count.") },
    { id: "stockouts", title: t("Отсутствие", "Тапшылық", "Stockouts"), description: t("Зафиксированные интервалы отсутствия товара. Статус показывает, учитывается ли запись.", "Тауар тапшылығы тіркелген кезеңдер. Мәртебе жазбаның есепке алынуын көрсетеді.", "Recorded stockout periods. Status shows whether a record is included.") },
    { id: "sales", title: t("Продажи", "Сатылымдар", "Sales"), description: t("Загруженные отгрузки клиентам. Отменённые документы видны для проверки, но не участвуют в расчёте.", "Клиенттерге жүктелген жөнелтілімдер. Күші жойылған құжаттар тексеру үшін көрсетіледі, бірақ есепке кірмейді.", "Imported customer shipments. Cancelled documents remain visible for review but are excluded from calculations.") },
    { id: "stock_history", title: t("История остатков", "Қалдықтар тарихы", "Stock history"), description: t("Все загруженные снимки остатков, включая более ранние даты.", "Қалдықтардың барлық жүктелген деректері, оның ішінде бұрынғы күндер.", "All imported stock snapshots, including earlier dates.") },
    { id: "growth", title: t("Прирост спроса", "Сұраныс өсімі", "Demand growth"), description: t("Прогноз по товару или категории. Неактивные записи видны для проверки, но не участвуют в расчёте.", "Тауар немесе санат бойынша болжам. Белсенді емес жазбалар тексеру үшін көрінеді, бірақ есепке кірмейді.", "Forecast by product or category. Inactive records remain visible for review but are excluded from calculations.") },
  ];
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
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setCatalogError(describeError(caught, t)); });
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
        .catch((caught: unknown) => { if (!controller.signal.aborted) setCatalogError(describeError(caught, t)); });
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
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(describeError(caught, t)); })
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
    return product ? `${product.name}${product.sku ? ` · ${product.sku}` : ""}` : t("Название товара загружается", "Тауар атауы жүктелуде", "Loading product name");
  }

  function warehouseLabel(id: string): string { return warehouseById.get(id) ?? "Название склада загружается"; }
  function unit(id: string): string { return productById.get(id)?.unit ?? ""; }
  function growthRate(value: string): string {
    const percent = Number(value) * 100;
    return Number.isFinite(percent) ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(percent)} %` : value;
  }

  const title = kinds.find((item) => item.id === tab)!;
  const hasRows = loadedKey === dataKey && rows.length > 0;

  return <div className={styles.page}>
    <PageHeader title={t('Запасы и спрос', 'Қорлар мен сұраныс', 'Stock and demand')} subtitle={t('Загруженные остатки, поставки, продажи и прогноз прироста', 'Жүктелген қалдықтар, жеткізілімдер, сатылымдар және өсім болжамы', 'Imported stock, deliveries, sales and growth forecast')} actions={<>{params.has("from") ? <Button variant="secondary" size="sm" icon={<ArrowLeft size={15} />} onClick={() => navigate(returnToRecommendation(params.get("from")), { replace: true })}>{t('К рекомендации', 'Ұсынымға', 'To recommendation')}</Button> : null}<Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={() => setReload((value) => value + 1)}>{t('Обновить', 'Жаңарту', 'Refresh')}</Button></>} />

    <Card title={t('Данные о товарах', 'Тауар деректері', 'Product data')} subtitle={t('Выберите склад и товар, чтобы уточнить список', 'Тізімді нақтылау үшін қойма мен тауарды таңдаңыз', 'Select a warehouse and product to narrow the list')}>
      <div className={styles.filters}>
        <Select label={t('Склад', 'Қойма', 'Warehouse')} value={warehouseId} onChange={(event) => updateParam("warehouse", event.target.value)}><option value="">{t('Все склады', 'Барлық қоймалар', 'All warehouses')}</option>{warehouseId && !warehouses.some((item) => item.id === warehouseId) ? <option value={warehouseId}>{warehouseId}</option> : null}{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <label>{t('Поиск товара', 'Тауар іздеу', 'Search products')}<input type="search" value={productSearch} maxLength={200} onChange={(event) => setProductSearch(event.target.value)} placeholder={t('Название или артикул', 'Атауы немесе артикулы', 'Name or SKU')} /></label>
        <Select label={t('Товар', 'Тауар', 'Product')} value={productId} onChange={(event) => updateParam("product", event.target.value)}><option value="">{t('Все товары', 'Барлық тауарлар', 'All products')}</option>{productId && !products.some((item) => item.id === productId) ? <option value={productId}>{productId}</option> : null}{products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}</Select>
      </div>
      {catalogError ? <p className={styles.catalogError} role="alert">{t('Справочники не загрузились: ', 'Анықтамалықтар жүктелмеді: ', 'Catalogs could not be loaded: ')}{catalogError} <button type="button" onClick={() => setReload((value) => value + 1)}>{t('Повторить', 'Қайталау', 'Retry')}</button></p> : null}
      <p className={styles.hint}>{t('Поиск товара выполняется в загруженном справочнике. Если результатов больше 200, уточните запрос. Вкладка «Прирост спроса» показывает прогнозы и по категориям, поэтому фильтры склада и товара на неё не влияют.', 'Тауар жүктелген анықтамалықтан ізделеді. Нәтиже 200-ден асса, сұрауды нақтылаңыз. «Сұраныс өсімі» қойындысында санат болжамдары да көрсетіледі, сондықтан қойма мен тауар сүзгілері оған әсер етпейді.', 'Product search uses the imported catalog. Refine the query if there are more than 200 results. Demand growth also shows category forecasts, so warehouse and product filters do not apply there.')}</p>
    </Card>

    <Card title={title.title} subtitle={title.description}>
      <Tabs items={kinds.map((item) => ({ id: item.id, label: item.title }))} value={tab} onValueChange={(value) => updateParam("tab", value)} ariaLabel={t('Вид данных', 'Дерек түрі', 'Data view')} />
      {error ? <ErrorState title={t('Не удалось загрузить запасы', 'Қор деректері жүктелмеді', 'Could not load stock data')} text={error} onRetry={() => setReload((value) => value + 1)} /> : (loading || loadedKey !== dataKey) && !hasRows ? <InventorySkeleton /> : <div aria-busy={loading}>
        {!hasRows ? <EmptyState title={t('Данных пока нет', 'Әзірге дерек жоқ', 'No data yet')} text={t('Измените фильтры или загрузите данные.', 'Сүзгілерді өзгертіңіз немесе деректерді жүктеңіз.', 'Change the filters or import data.')} /> : <>
        {tab === "stocks" ? <Table><thead><Tr><Th>{t('Товар', 'Тауар', 'Product')}</Th><Th>{t('Склад', 'Қойма', 'Warehouse')}</Th><Th numeric>{t('Остаток', 'Қалдық', 'Stock')}</Th><Th numeric>{t('Резерв', 'Резерв', 'Reserved')}</Th><Th>{t('Снимок', 'Тіркелген күні', 'Snapshot')}</Th></Tr></thead><tbody>{(rows as StockRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td numeric>{formatQuantity(row.reserved)} {unit(row.product_id)}</Td><Td>{formatDate(row.as_of, locale)}</Td></Tr>)}</tbody></Table> : null}
        {tab === "inbound" ? <Table><thead><Tr><Th>{t('Товар', 'Тауар', 'Product')}</Th><Th>{t('Склад', 'Қойма', 'Warehouse')}</Th><Th>{t('Поставщик', 'Жеткізуші', 'Supplier')}</Th><Th numeric>{t('Количество', 'Саны', 'Quantity')}</Th><Th>{t('Ожидается', 'Күтілетін күні', 'Expected')}</Th><Th>{t('Статус', 'Мәртебе', 'Status')}</Th></Tr></thead><tbody>{(rows as InboundRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong><small className={styles.secondary}>{t('Документ ', 'Құжат ', 'Document ')}{row.document_id}</small></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td>{row.supplier_id ? supplierById.get(row.supplier_id) ?? t("Название поставщика загружается", "Жеткізуші атауы жүктелуде", "Loading supplier name") : "—"}</Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td>{formatDate(row.expected_date, locale)}</Td><Td>{inboundStatus(row.status)}</Td></Tr>)}</tbody></Table> : null}
        {tab === "stockouts" ? <Table><thead><Tr><Th>{t('Товар', 'Тауар', 'Product')}</Th><Th>{t('Склад', 'Қойма', 'Warehouse')}</Th><Th>{t('Начало', 'Басталуы', 'Start')}</Th><Th>{t('Конец', 'Аяқталуы', 'End')}</Th><Th>{t('Статус записи', 'Жазба мәртебесі', 'Record status')}</Th></Tr></thead><tbody>{(rows as StockoutRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td>{formatDate(row.start, locale)}</Td><Td>{row.end ? formatDate(row.end, locale) : t('Не указан', 'Көрсетілмеген', 'Not specified')}</Td><Td>{row.active ? t('Учитывается', 'Есепке алынады', 'Included') : t('Неактивна', 'Белсенді емес', 'Inactive')}</Td></Tr>)}</tbody></Table> : null}
        {tab === "sales" ? <Table><thead><Tr><Th>{t('Дата', 'Күні', 'Date')}</Th><Th>{t('Товар', 'Тауар', 'Product')}</Th><Th>{t('Склад', 'Қойма', 'Warehouse')}</Th><Th>{t('Документ', 'Құжат', 'Document')}</Th><Th numeric>{t('Количество', 'Саны', 'Quantity')}</Th><Th>{t('Статус', 'Мәртебе', 'Status')}</Th></Tr></thead><tbody>{(rows as SaleRow[]).map((row) => <Tr key={row.id}><Td>{formatDate(row.date, locale)}</Td><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td>{row.document_id}<small className={styles.secondary}>{t('Строка ', 'Жол ', 'Line ')}{row.line_id}</small></Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td>{row.status === "posted" ? t('Проведена', 'Өткізілген', 'Posted') : row.status === "cancelled" ? t('Отменена', 'Күші жойылған', 'Cancelled') : row.status}</Td></Tr>)}</tbody></Table> : null}
        {tab === "stock_history" ? <Table><thead><Tr><Th>{t('Товар', 'Тауар', 'Product')}</Th><Th>{t('Склад', 'Қойма', 'Warehouse')}</Th><Th numeric>{t('Остаток', 'Қалдық', 'Stock')}</Th><Th numeric>{t('Резерв', 'Резерв', 'Reserved')}</Th><Th>{t('Дата снимка', 'Тіркелген күні', 'Snapshot date')}</Th></Tr></thead><tbody>{(rows as StockRow[]).map((row) => <Tr key={row.id}><Td><strong>{productLabel(row.product_id)}</strong></Td><Td>{warehouseLabel(row.warehouse_id)}</Td><Td numeric>{formatQuantity(row.quantity)} {unit(row.product_id)}</Td><Td numeric>{formatQuantity(row.reserved)} {unit(row.product_id)}</Td><Td>{formatDateTime(row.as_of, locale)}</Td></Tr>)}</tbody></Table> : null}
        {tab === "growth" ? <Table><thead><Tr><Th>{t('Объект прогноза', 'Болжам нысаны', 'Forecast target')}</Th><Th>{t('Период', 'Кезең', 'Period')}</Th><Th numeric>{t('Прирост', 'Өсім', 'Growth')}</Th><Th>{t('Применение', 'Қолданылуы', 'Application')}</Th><Th>{t('Статус записи', 'Жазба мәртебесі', 'Record status')}</Th></Tr></thead><tbody>{(rows as GrowthRow[]).map((row) => <Tr key={row.id}><Td><strong>{row.product_id ? productLabel(row.product_id) : row.category_id ? `${t("Категория: ", "Санат: ", "Category: ")}${categoryById.get(row.category_id) ?? t("Название категории загружается", "Санат атауы жүктелуде", "Loading category name")}` : t('Объект не указан', 'Нысан көрсетілмеген', 'Target not specified')}</strong></Td><Td>{formatDate(row.start, locale)} — {formatDate(row.end, locale)}</Td><Td numeric>{growthRate(row.rate)}</Td><Td>{row.mode === "additional" ? t('Дополнительно к тренду', 'Трендке қосымша', 'In addition to trend') : row.mode === "replace_trend" ? t('Вместо тренда', 'Тренд орнына', 'Replace trend') : row.mode}</Td><Td>{row.active ? t('Учитывается', 'Есепке алынады', 'Included') : t('Неактивна', 'Белсенді емес', 'Inactive')}</Td></Tr>)}</tbody></Table> : null}
        </>}
        <div className={styles.pager}><span>{hasRows ? `${t("Записи", "Жазбалар", "Records")} ${offset + 1}–${offset + rows.length}` : t('Записей на странице нет', 'Бұл бетте жазба жоқ', 'No records on this page')}{loading ? t(' · обновляем', ' · жаңартылуда', ' · updating') : ""}</span><div><Button variant="secondary" size="sm" disabled={loading || offset === 0} onClick={() => updateParam("offset", String(Math.max(0, offset - PAGE_SIZE)))}>{t('Назад', 'Артқа', 'Previous')}</Button><Button variant="secondary" size="sm" disabled={loading || !hasRows || rows.length < PAGE_SIZE} onClick={() => updateParam("offset", String(offset + PAGE_SIZE))}>{t('Далее', 'Келесі', 'Next')}</Button></div></div>
      </div>}
    </Card>
  </div>;
}
