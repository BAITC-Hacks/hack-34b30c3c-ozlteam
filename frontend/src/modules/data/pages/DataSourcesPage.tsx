import { Check, FileUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Modal, Select, Table, Td, Th, Tr } from "../../../shared/ui";
import { applyImport, createSource, getImport, listExchangeBatches, listImports, listSources, stageImport } from "../api/data";
import type { ExchangeBatch, ImportBatch, ImportDetail, RowError, Source } from "../types";
import { PackageImportsPanel } from "../components/PackageImportsPanel";
import styles from "./DataSourcesPage.module.css";

const kinds = [
  ["categories", "Категории"], ["suppliers", "Поставщики"], ["warehouses", "Склады"],
  ["products", "Товары"], ["sales", "Продажи"], ["stocks", "Остатки"],
  ["inbound", "Товары в пути"], ["stockouts", "Отсутствие товара"], ["growth", "Прирост спроса"],
] as const;

const kindName = new Map<string, string>(kinds);
function localizedKindName(kind: string, t: ReturnType<typeof useI18n>["t"]): string {
  const labels: Record<string, [string, string, string]> = {
    categories: ["Категории", "Санаттар", "Categories"], suppliers: ["Поставщики", "Жеткізушілер", "Suppliers"], warehouses: ["Склады", "Қоймалар", "Warehouses"],
    products: ["Товары", "Тауарлар", "Products"], sales: ["Продажи", "Сатылымдар", "Sales"], stocks: ["Остатки", "Қорлар", "Stock"],
    inbound: ["Товары в пути", "Жолдағы тауарлар", "Inbound goods"], stockouts: ["Отсутствие товара", "Тауар жоқ кезеңдер", "Stockouts"], growth: ["Прирост спроса", "Сұраныс өсімі", "Demand growth"],
  };
  const label = labels[kind];
  return label ? t(...label) : kind;
}
type ImportField = { name: string; label: string };
type KindFormat = { required: ImportField[]; optional: ImportField[]; note: string };
const fields = (names: string): ImportField[] => names.split(" ").map((name) => ({ name, label: name }));
const common = fields("external_id revision");
const commonOptional = fields("source_updated_at");
const formats: Record<string, KindFormat> = {
  categories: { required: [...common, ...fields("name")], optional: [...commonOptional, ...fields("review_days safety_days active")], note: "Сначала загрузите категории. external_id — устойчивый ID категории в источнике." },
  suppliers: { required: [...common, ...fields("name")], optional: [...commonOptional, ...fields("active")], note: "Поставщик нужен до загрузки товара, который на него ссылается." },
  warehouses: { required: [...common, ...fields("name")], optional: [...commonOptional, ...fields("organization_external_id active")], note: "Склад нужен до загрузки продаж, остатков и поставок." },
  products: { required: [...common, ...fields("sku name unit")], optional: [...commonOptional, ...fields("code category_external_id supplier_external_id characteristic_external_id pack_size min_order_qty lead_time_days active")], note: "Артикул sku и код code не заменяют устойчивый external_id. Количество — в базовой единице unit." },
  sales: { required: [...common, ...fields("product_external_id warehouse_external_id date document_id line_id quantity")], optional: [...commonOptional, ...fields("document_date price client_id status")], note: "date: ГГГГ-ММ-ДД; возврат — отрицательное количество. client_id допускается только обезличенный." },
  stocks: { required: [...common, ...fields("product_external_id warehouse_external_id as_of quantity")], optional: [...commonOptional, ...fields("reserved")], note: "as_of — дата и время с часовым поясом, например 2026-09-23T09:00:00+05:00." },
  inbound: { required: [...common, ...fields("product_external_id warehouse_external_id document_id expected_date quantity")], optional: [...commonOptional, ...fields("supplier_external_id status")], note: "expected_date: ГГГГ-ММ-ДД; quantity — ещё не полученное количество." },
  stockouts: { required: [...common, ...fields("product_external_id warehouse_external_id start")], optional: [...commonOptional, ...fields("end active")], note: "start и end: ГГГГ-ММ-ДД. Загружайте только подтверждённые интервалы отсутствия." },
  growth: { required: [...common, ...fields("start end rate")], optional: [...commonOptional, ...fields("product_external_id category_external_id mode active")], note: "Укажите ровно одно: product_external_id или category_external_id. rate=0.1 означает 10%." },
};
function localizedFormatNote(kind: string, fallback: string, t: ReturnType<typeof useI18n>["t"]): string {
  switch (kind) {
    case "categories": return t(fallback, "Алдымен санаттарды жүктеңіз. external_id — дереккөздегі тұрақты санат ID-і.", "Import categories first. external_id is the stable category ID in the source.");
    case "suppliers": return t(fallback, "Жеткізуші оған сілтеме жасайтын тауардан бұрын жүктелуі керек.", "Import the supplier before products that reference it.");
    case "warehouses": return t(fallback, "Қойманы сатылымдар, қорлар және жеткізілімдерден бұрын жүктеңіз.", "Import warehouses before sales, stock and inbound deliveries.");
    case "products": return t(fallback, "sku артикулы мен code коды тұрақты external_id орнына жүрмейді. Мөлшер unit базалық бірлігінде көрсетіледі.", "SKU and code do not replace stable external_id. Quantity uses the base unit in unit.");
    case "sales": return t(fallback, "date: ЖЖЖЖ-АА-КК; қайтарым — теріс мөлшер. client_id тек иесіздендірілген болуы керек.", "date: YYYY-MM-DD; returns use negative quantities. client_id must be anonymized.");
    case "stocks": return t(fallback, "as_of — уақыт белдеуі бар күн мен уақыт, мысалы 2026-09-23T09:00:00+05:00.", "as_of is a date and time with time zone, e.g. 2026-09-23T09:00:00+05:00.");
    case "inbound": return t(fallback, "expected_date: ЖЖЖЖ-АА-КК; quantity — әлі қабылданбаған мөлшер.", "expected_date: YYYY-MM-DD; quantity is the amount not yet received.");
    case "stockouts": return t(fallback, "start және end: ЖЖЖЖ-АА-КК. Тауар жоқ болған расталған кезеңдерді ғана жүктеңіз.", "start and end: YYYY-MM-DD. Import only confirmed stockout periods.");
    case "growth": return t(fallback, "Тек біреуін көрсетіңіз: product_external_id немесе category_external_id. rate=0.1 — 10% өсім.", "Specify exactly one of product_external_id or category_external_id. rate=0.1 means 10% growth.");
    default: return fallback;
  }
}
type MappingRow = { id: number; source: string; target: string };
const statusName: Record<string, string> = { validated: "Проверен", invalid: "Есть ошибки", applied: "Применён" };
function localizedStatusName(status: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (status === "validated") return t("Проверен", "Тексерілді", "Validated");
  if (status === "invalid") return t("Есть ошибки", "Қателер бар", "Has errors");
  if (status === "applied") return t("Применён", "Қолданылды", "Applied");
  return status;
}
const PAGE_SIZE = 20;
const formatDate = (value: string | null, locale: string) => value ? new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function errorText(error: unknown, t: ReturnType<typeof useI18n>["t"]): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return t("У вашей роли нет права на это действие.", "Сіздің рөліңізге бұл әрекетке рұқсат жоқ.", "Your role cannot perform this action.");
    if (error.status === 409) return t("Версия источника изменилась после проверки. Загрузите файл заново.", "Тексеруден кейін дереккөз нұсқасы өзгерді. Файлды қайта жүктеңіз.", "The source version changed after validation. Upload the file again.");
    if (error.status === 413) return t("Файл слишком большой: до 25 МиБ и 10 000 строк.", "Файл тым үлкен: 25 МиБ және 10 000 жолға дейін.", "File too large: maximum 25 MiB and 10,000 rows.");
    if (error.status === 415) return t("Поддерживаются CSV UTF-8 и XLSX.", "CSV UTF-8 және XLSX қолдау көрсетіледі.", "CSV UTF-8 and XLSX are supported.");
  }
  return error instanceof Error ? error.message : t("Не удалось выполнить действие.", "Әрекетті орындау мүмкін болмады.", "Could not complete the action.");
}

function importIssueText(issue: RowError, t: ReturnType<typeof useI18n>["t"]): string {
  const location = [issue.sheet, issue.row > 0 ? `${t("строка", "жол", "row")} ${issue.row}` : null, issue.column ? `${t("колонка", "баған", "column")} «${issue.column}»` : null]
    .filter(Boolean).join(" · ");
  const message = issue.message === "Field required"
    ? t("Обязательное значение отсутствует. Проверьте заголовок колонки, сопоставление и ячейку.", "Міндетті мән жоқ. Баған атауын, сәйкестендіруді және ұяшықты тексеріңіз.", "Required value is missing. Check the column header, mapping and cell.")
    : issue.message.startsWith("Input should be a valid integer")
      ? t("Ожидается целое число.", "Бүтін сан қажет.", "An integer is required.")
      : issue.message.startsWith("Input should be a valid number") || issue.message.startsWith("Input should be a valid decimal")
        ? t("Ожидается число.", "Сан қажет.", "A number is required.")
        : issue.message.startsWith("Input should be a valid datetime")
          ? t("Ожидается дата и время с часовым поясом.", "Уақыт белдеуі бар күн мен уақыт қажет.", "A date and time with time zone is required.")
          : issue.message.startsWith("Input should be a valid date")
            ? t("Ожидается дата.", "Күн қажет.", "A date is required.")
            : issue.message;
  return location ? `${location}: ${message}` : message;
}

function DataSkeleton() {
  const { t } = useI18n();
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label={t("Загружаем источники данных", "Дереккөздер жүктелуде", "Loading data sources")}>
    <div><i /><i /><i /></div><div><i /><i /><i /><i /></div>
  </div>;
}

function SourceList({ sources, selectedSourceId, onViewBatches }: { sources: Source[]; selectedSourceId: string | null; onViewBatches: (id: string) => void }) {
  const { locale, t } = useI18n();
  return <Card title={t("Источники", "Дереккөздер", "Sources")} subtitle={t("Версия и полнота данных, полученных из 1С или файлов", "1С немесе файлдардан алынған деректердің нұсқасы мен толықтығы", "Version and completeness of data from 1C or files")}>
    {sources.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>{t("Источник", "Дереккөз", "Source")}</Th><Th>{t("Версия", "Нұсқа", "Version")}</Th><Th>{t("Состояние", "Күйі", "Status")}</Th><Th>{t("Синхронизация", "Синхрондау", "Sync")}</Th><Th>{t("Пакеты", "Пакеттер", "Packages")}</Th></Tr></thead><tbody>
      {sources.map((source) => <Tr key={source.id}>
        <Td><strong>{source.name}</strong><small className={styles.muted}>{source.system === "1c" ? t("База 1С", "1С базасы", "1C database") : t("Файловые выгрузки", "Файлдық экспорттар", "File exports")}</small></Td>
        <Td>{source.revision}</Td>
        <Td><Badge tone={source.complete ? "success" : "warning"}>{source.complete ? t("Полный набор", "Толық жиын", "Complete set") : t("Загрузка не завершена", "Жүктеу аяқталмады", "Import incomplete")}</Badge></Td>
        <Td>{formatDate(source.synced_at, locale)}</Td>
        <Td><button className={styles.textButton} type="button" aria-pressed={selectedSourceId === source.id} onClick={() => onViewBatches(source.id)}>{selectedSourceId === source.id ? t("Скрыть", "Жасыру", "Hide") : t("Журнал", "Журнал", "Log")}<span className="srOnly"> {t("источника", "дереккөзі", "for source")} {source.name}</span></button></Td>
      </Tr>)}
    </tbody></Table></div> : <EmptyState title={t("Источников пока нет", "Әзірге дереккөздер жоқ", "No sources yet")} text={t("Зарегистрируйте базу 1С или источник файловых выгрузок.", "1С базасын немесе файлдық экспорт дереккөзін тіркеңіз.", "Register a 1C database or file export source.")} />}
  </Card>;
}

function ImportHistory({ batches, sourceNames, onOpen, page, hasNext, loading, onPageChange }: { batches: ImportBatch[]; sourceNames: Map<string, string>; onOpen: (id: string) => void; page: number; hasNext: boolean; loading: boolean; onPageChange: (page: number) => void }) {
  const { locale, t } = useI18n();
  return <Card title={t("История загрузок", "Жүктеу тарихы", "Import history")} subtitle={t("Проверенные файлы и результаты применения", "Тексерілген файлдар және қолдану нәтижелері", "Validated files and application results")}>
    {batches.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>{t("Файл", "Файл", "File")}</Th><Th>{t("Источник", "Дереккөз", "Source")}</Th><Th>{t("Строк", "Жолдар", "Rows")}</Th><Th>{t("Состояние", "Күйі", "Status")}</Th><Th>{t("Проверка", "Тексеру", "Check")}</Th></Tr></thead><tbody>
      {batches.map((batch) => <Tr key={batch.id}>
        <Td><strong>{batch.filename}</strong><small className={styles.muted}>{localizedKindName(batch.kind, t)} · {formatDate(batch.created_at, locale)}</small></Td>
        <Td>{sourceNames.get(batch.source_id) ?? batch.source_id.slice(0, 8)}</Td>
        <Td>{batch.row_count}</Td>
        <Td><Badge tone={batch.status === "applied" ? "success" : batch.status === "invalid" ? "danger" : "warning"}>{localizedStatusName(batch.status, t)}</Badge></Td>
        <Td><button className={styles.textButton} type="button" onClick={() => onOpen(batch.id)}>{t("Открыть", "Ашу", "Open")}<span className="srOnly"> {batch.filename}</span></button></Td>
      </Tr>)}
    </tbody></Table></div> : loading ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label={t("Загружаем историю", "Тарих жүктелуде", "Loading history")} /> : <EmptyState title={page ? t("На этой странице загрузок нет", "Бұл бетте жүктеулер жоқ", "No imports on this page") : t("Файлы ещё не загружались", "Файлдар әлі жүктелмеген", "No files imported yet")} text={page ? t("Вернитесь к предыдущей странице.", "Алдыңғы бетке оралыңыз.", "Return to the previous page.") : t("Выберите источник и загрузите нормализованный CSV или XLSX.", "Дереккөзді таңдап, қалыпқа келтірілген CSV немесе XLSX жүктеңіз.", "Choose a source and upload a normalized CSV or XLSX.")} />}
    {(page > 0 || hasNext) ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => onPageChange(page - 1)}>{t("Назад", "Артқа", "Previous")}</Button><span>{t("Страница", "Бет", "Page")} {page + 1}</span><Button variant="secondary" size="sm" disabled={!hasNext || loading} onClick={() => onPageChange(page + 1)}>{t("Далее", "Келесі", "Next")}</Button></div> : null}
  </Card>;
}

function ExchangeHistory({ source, batches, page, hasNext, loading, error, onPageChange, onClose }: { source: Source; batches: ExchangeBatch[]; page: number; hasNext: boolean; loading: boolean; error: string | null; onPageChange: (page: number) => void; onClose: () => void }) {
  const { locale, t } = useI18n();
  return <Card title={`${t("Пакеты источника", "Дереккөз пакеттері", "Source packages")}: ${source.name}`} subtitle={t("Журнал успешно применённых нормализованных пакетов; регистрация источника сама по себе не подключает 1С", "Сәтті қолданылған қалыпқа келтірілген пакеттер журналы; дереккөзді тіркеу 1С-ке қоспайды", "Log of successfully applied normalized packages; registering a source does not connect to 1C")} actions={<Button variant="ghost" size="sm" onClick={onClose}>{t("Закрыть", "Жабу", "Close")}</Button>}>
    {error ? <Alert tone="danger" title={t("Не удалось загрузить журнал", "Журналды жүктеу мүмкін болмады", "Could not load log")}>{error}</Alert> : null}
    {loading ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label={t("Загружаем пакеты источника", "Дереккөз пакеттері жүктелуде", "Loading source packages")} /> : batches.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>{t("Пакет", "Пакет", "Package")}</Th><Th>{t("Ревизия", "Ревизия", "Revision")}</Th><Th>{t("Строк", "Жолдар", "Rows")}</Th><Th>{t("Курсор", "Курсор", "Cursor")}</Th><Th>{t("Применён", "Қолданылды", "Applied")}</Th></Tr></thead><tbody>
      {batches.map((batch) => <Tr key={batch.id}><Td><strong>{batch.batch_key}</strong></Td><Td>{batch.revision}</Td><Td>{batch.row_count}</Td><Td>{batch.cursor ?? "—"}</Td><Td>{formatDate(batch.created_at, locale)}</Td></Tr>)}
    </tbody></Table></div> : !error ? <EmptyState title={page ? t("На этой странице пакетов нет", "Бұл бетте пакеттер жоқ", "No packages on this page") : t("Применённых пакетов пока нет", "Әзірге қолданылған пакеттер жоқ", "No applied packages yet")} text={page ? t("Вернитесь к предыдущей странице.", "Алдыңғы бетке оралыңыз.", "Return to the previous page.") : t("Пакеты появятся после обмена через внешний адаптер 1С.", "Пакеттер сыртқы 1С адаптерімен алмасудан кейін пайда болады.", "Packages will appear after exchange through the external 1C adapter.")} /> : null}
    {(page > 0 || hasNext) ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => onPageChange(page - 1)}>{t("Назад", "Артқа", "Previous")}</Button><span>{t("Страница", "Бет", "Page")} {page + 1}</span><Button variant="secondary" size="sm" disabled={!hasNext || loading} onClick={() => onPageChange(page + 1)}>{t("Далее", "Келесі", "Next")}</Button></div> : null}
  </Card>;
}

function previewLabel(row: Record<string, unknown>): string {
  return [row.name, row.sku, row.product_external_id, row.quantity, row.date ?? row.as_of ?? row.expected_date]
    .filter((value) => value !== undefined && value !== null).map(String).join(" · ") || "—";
}

export function DataSourcesPage() {
  const { locale, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const batchId = params.get("import");
  const [sources, setSources] = useState<Source[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [importPage, setImportPage] = useState(0);
  const [importsHasNext, setImportsHasNext] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [exchangeBatches, setExchangeBatches] = useState<ExchangeBatch[]>([]);
  const [exchangePage, setExchangePage] = useState(0);
  const [exchangeHasNext, setExchangeHasNext] = useState(false);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"source" | "stage" | "apply" | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceSystem, setSourceSystem] = useState<"1c" | "file">("file");
  const [sourceId, setSourceId] = useState("");
  const [kind, setKind] = useState<string>("categories");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const nextMappingId = useRef(0);
  const [reverseSign, setReverseSign] = useState(false);
  const [complete, setComplete] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources]);
  const selectedSource = sources.find((source) => source.id === selectedSourceId);
  const format = formats[kind];

  function changeMapping(id: number, changes: Partial<MappingRow>) {
    setMappingRows((rows) => rows.map((row) => row.id === id ? { ...row, ...changes } : row));
  }

  function addMapping() {
    setMappingRows((rows) => [...rows, { id: nextMappingId.current++, source: "", target: "" }]);
  }

  function viewBatches(id: string) {
    setExchangePage(0);
    setExchangeBatches([]);
    setExchangeError(null);
    setSelectedSourceId((current) => current === id ? null : id);
  }

  function selectBatch(id: string | null) {
    setApplyOpen(false);
    setComplete(false);
    setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("import", id); else next.delete("import"); return next; });
  }

  function closeApplyModal() {
    setApplyOpen(false);
    setComplete(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setBatches([]);
    setImportsHasNext(false);
    Promise.all([listSources(controller.signal), listImports(PAGE_SIZE + 1, importPage * PAGE_SIZE, controller.signal)]).then(([nextSources, nextBatches]) => {
      setSources(nextSources);
      setBatches(nextBatches.slice(0, PAGE_SIZE));
      setImportsHasNext(nextBatches.length > PAGE_SIZE);
      setSourceId((current) => current || nextSources[0]?.id || "");
      setError(null);
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught, t)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload, importPage]);

  useEffect(() => {
    if (!selectedSourceId) return;
    const controller = new AbortController();
    setExchangeLoading(true);
    setExchangeError(null);
    listExchangeBatches(selectedSourceId, PAGE_SIZE + 1, exchangePage * PAGE_SIZE, controller.signal)
      .then((nextBatches) => {
        setExchangeBatches(nextBatches.slice(0, PAGE_SIZE));
        setExchangeHasNext(nextBatches.length > PAGE_SIZE);
      })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setExchangeError(errorText(caught, t)); })
      .finally(() => { if (!controller.signal.aborted) setExchangeLoading(false); });
    return () => controller.abort();
  }, [selectedSourceId, exchangePage, reload]);

  useEffect(() => {
    setDetail(null);
    setComplete(false);
    setApplyOpen(false);
    if (!batchId) return;
    const controller = new AbortController();
    setDetailLoading(true);
    getImport(batchId, controller.signal).then(setDetail)
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught, t)); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [batchId]);

  async function addSource() {
    if (!sourceName.trim()) return;
    setBusy("source"); setError(null); setNotice(null);
    try {
      const added = await createSource(sourceName.trim(), sourceSystem);
      setSourceName(""); setSourceId(added.id); setReload((value) => value + 1);
      setNotice(t("Источник зарегистрирован. Теперь можно загрузить нормализованный файл.", "Дереккөз тіркелді. Енді қалыпқа келтірілген файлды жүктеуге болады.", "Source registered. You can now upload a normalized file."));
    } catch (caught) { setError(errorText(caught, t)); }
    finally { setBusy(null); }
  }

  async function upload() {
    if (!sourceId || !file) return;
    const pairs = mappingRows.map((row) => ({ source: row.source.trim(), target: row.target }));
    if (pairs.some((row) => !row.source || !row.target)) {
      setError(t("Заполните оба поля каждой пары сопоставления или удалите пустую строку.", "Әр сәйкестендіру жұбының екі өрісін толтырыңыз немесе бос жолды жойыңыз.", "Fill both fields in each mapping pair or remove the empty row.")); return;
    }
    if (new Set(pairs.map((row) => row.source)).size !== pairs.length || new Set(pairs.map((row) => row.target)).size !== pairs.length) {
      setError(t("Каждую исходную колонку и каждое поле результата можно выбрать только один раз.", "Әр бастапқы баған мен нәтиже өрісін бір рет қана таңдауға болады.", "Each source column and output field can be selected only once.")); return;
    }
    if (pairs.length) {
      const targets = new Set(pairs.map((row) => row.target));
      const missing = format.required.filter((field) => !targets.has(field.name)).map((field) => field.name);
      if (missing.length) { setError(`${t("Добавьте обязательные поля в сопоставление", "Сәйкестендіруге міндетті өрістерді қосыңыз", "Add required fields to the mapping")}: ${missing.join(", ")}.`); return; }
    }
    const mapping = Object.fromEntries(pairs.map(({ source, target }) => [source, target]));
    setBusy("stage"); setError(null); setNotice(null);
    try {
      const staged = await stageImport({ sourceId, kind, file, mapping: JSON.stringify(mapping), multiplier: reverseSign ? -1 : 1 });
      setFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
      setDetail(staged); selectBatch(staged.id); setImportPage(0); setReload((value) => value + 1);
      setNotice(staged.status === "invalid" ? t("Файл проверен: исправьте ошибки и загрузите его снова.", "Файл тексерілді: қателерді түзетіп, қайта жүктеңіз.", "File checked: fix the errors and upload it again.") : t("Файл проверен. Просмотрите строки перед применением.", "Файл тексерілді. Қолданар алдында жолдарды қарап шығыңыз.", "File checked. Review the rows before applying."));
    } catch (caught) { setError(errorText(caught, t)); }
    finally { setBusy(null); }
  }

  async function confirmApply() {
    if (!detail || detail.status !== "validated") return;
    setBusy("apply"); setError(null);
    try {
      const applied = await applyImport(detail.id, complete);
      setDetail(applied); closeApplyModal(); setReload((value) => value + 1);
      setNotice(complete ? t("Данные применены. Пакет отмечен завершённым; расчёт для полного источника разрешён.", "Деректер қолданылды. Пакет аяқталды деп белгіленді; толық дереккөз үшін есептеуге рұқсат берілді.", "Data applied. The package is marked complete; calculations are enabled for the full source.") : t("Данные применены. Пакет остаётся незавершённым до загрузки последней согласованной части.", "Деректер қолданылды. Келісілген соңғы бөлік жүктелгенше пакет аяқталмаған күйде қалады.", "Data applied. The package remains incomplete until the final agreed part is uploaded."));
    } catch (caught) { setError(errorText(caught, t)); }
    finally { setBusy(null); }
  }

  return <div className={styles.page}>
    <PageHeader title={t("Источники данных", "Дереккөздер", "Data sources")} subtitle={t("Проверка нормализованных файлов перед расчётом пополнения", "Толықтыруды есептемес бұрын қалыпқа келтірілген файлдарды тексеру", "Check normalized files before calculating replenishment")} actions={<><Button variant="secondary" size="sm" onClick={() => navigate("/data/integrations", { state: { from: `${location.pathname}${location.search}${location.hash}` } })}>{t("Интеграция с 1С", "1С интеграциясы", "1C integration")}</Button><Button variant="secondary" size="sm" icon={<RefreshCw size={15} strokeWidth={1.8} />} onClick={() => setReload((value) => value + 1)}>{t("Обновить", "Жаңарту", "Refresh")}</Button></>} />
    {error ? <Alert tone="danger" title={t("Действие не выполнено", "Әрекет орындалмады", "Action failed")} onDismiss={() => setError(null)}>{error}</Alert> : null}
    {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
    <PackageImportsPanel sources={sources} onChanged={() => setReload((value) => value + 1)} />
    {loading && !sources.length && !batches.length ? <DataSkeleton /> : <>
      <SourceList sources={sources} selectedSourceId={selectedSourceId} onViewBatches={viewBatches} />
      {selectedSource ? <ExchangeHistory source={selectedSource} batches={exchangeBatches} page={exchangePage} hasNext={exchangeHasNext} loading={exchangeLoading} error={exchangeError} onPageChange={setExchangePage} onClose={() => setSelectedSourceId(null)} /> : null}
      <div className={styles.forms}>
        <Card title={t("Зарегистрировать источник", "Дереккөзді тіркеу", "Register source")} subtitle={t("Регистрация базы 1С не устанавливает соединение с ней", "1С базасын тіркеу онымен байланыс орнатпайды", "Registering a 1C database does not connect to it")}>
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void addSource(); }}>
            <label>{t("Название", "Атауы", "Name")}<input value={sourceName} maxLength={200} required onChange={(event) => setSourceName(event.target.value)} placeholder={t("Например, 1С Алматы", "Мысалы, 1С Алматы", "For example, 1C Almaty")} /></label>
            <Select label={t("Тип", "Түрі", "Type")} wrapperClassName={styles.selectField} value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value as "1c" | "file")}><option value="file">{t("Файловые выгрузки", "Файлдық экспорттар", "File exports")}</option><option value="1c">{t("База 1С", "1С базасы", "1C database")}</option></Select>
            <Button type="submit" variant="secondary" icon={<Plus size={16} strokeWidth={1.8} />} loading={busy === "source"} disabled={!sourceName.trim() || busy !== null}>{t("Добавить источник", "Дереккөз қосу", "Add source")}</Button>
          </form>
        </Card>
        <Card title={t("Загрузить файл", "Файл жүктеу", "Upload file")} subtitle={t("CSV UTF-8 или XLSX · до 25 МиБ и 10 000 строк", "CSV UTF-8 немесе XLSX · 25 МиБ және 10 000 жолға дейін", "CSV UTF-8 or XLSX · up to 25 MiB and 10,000 rows")}>
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void upload(); }}>
            <Select label={t("Источник", "Дереккөз", "Source")} wrapperClassName={styles.selectField} value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="">{t("Выберите источник", "Дереккөзді таңдаңыз", "Choose source")}</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>
            <Select label={t("Вид данных", "Деректер түрі", "Data type")} wrapperClassName={styles.selectField} value={kind} onChange={(event) => { setKind(event.target.value); setMappingRows([]); }}>{kinds.map(([value]) => <option key={value} value={value}>{localizedKindName(value, t)}</option>)}</Select>
            <div className={styles.formatGuide}>
              <strong>{t("Формат", "Пішім", "Format")}: {localizedKindName(kind, t)}</strong>
              <p>{t("Обязательные колонки", "Міндетті бағандар", "Required columns")}: <code>{format.required.map((field) => field.name).join(", ")}</code></p>
              <p>{t("Дополнительные", "Қосымша", "Optional")}: <code>{format.optional.map((field) => field.name).join(", ")}</code></p>
              <p>{localizedFormatNote(kind, format.note, t)}</p>
            </div>
            <label>{t("Файл", "Файл", "File")}
              <span className={styles.fileControl}>
                <span className={styles.fileChoose}>{t("Выбрать файл", "Файл таңдау", "Choose file")}</span>
                <span className={styles.fileName} aria-live="polite">{file?.name ?? t("Файл не выбран", "Файл таңдалмады", "No file selected")}</span>
                <input ref={fileInputRef} type="file" aria-label={t("Выбрать файл", "Файл таңдау", "Choose file")} accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
              </span>
            </label>
            <details className={styles.advanced}><summary>{t("Дополнительные настройки", "Қосымша баптаулар", "Advanced settings")}</summary><div className={styles.advancedBody}>
              <div className={styles.mappingEditor}>
                <strong>{t("Сопоставление колонок", "Бағандарды сәйкестендіру", "Column mapping")}</strong>
                <p className={styles.mappingHint}>{t("Если заголовки файла уже совпадают с полями выше, оставьте список пустым. Если добавили хотя бы одну пару, перечислите все колонки файла, которые хотите сохранить: остальные сервер пропустит. Это переименование колонок, не сопоставление товаров.", "Файл бағандарының атауы жоғарыдағы өрістерге сәйкес келсе, тізімді бос қалдырыңыз. Бір жұп қоссаңыз, сақтағыңыз келетін барлық бағанды көрсетіңіз: қалғанын сервер өткізіп жібереді. Бұл тауарларды емес, бағандарды қайта атау.", "If file headers already match the fields above, leave this list empty. If you add a mapping pair, list every column you want to keep; the server skips the rest. This renames columns, it does not match products.")}</p>
                {mappingRows.map((row) => <div className={styles.mappingRow} key={row.id}>
                  <label>{t("Заголовок в файле", "Файлдағы баған атауы", "Header in file")}<input value={row.source} onChange={(event) => changeMapping(row.id, { source: event.target.value })} placeholder={t("Например, Код записи", "Мысалы, Жазба коды", "For example, Record code")} /></label>
                  <Select label={t("Поле результата", "Нәтиже өрісі", "Output field")} wrapperClassName={styles.selectField} value={row.target} onChange={(event) => changeMapping(row.id, { target: event.target.value })}><option value="">{t("Выберите поле", "Өрісті таңдаңыз", "Choose field")}</option>{[...format.required, ...format.optional].map((field) => <option key={field.name} value={field.name}>{field.label}</option>)}</Select>
                  <Button type="button" variant="ghost" size="sm" icon={<Trash2 size={15} />} aria-label={`${t("Удалить сопоставление", "Сәйкестендіруді жою", "Remove mapping")} ${row.source || row.id}`} onClick={() => setMappingRows((rows) => rows.filter((item) => item.id !== row.id))}>{t("Удалить", "Жою", "Remove")}</Button>
                </div>)}
                <Button type="button" variant="secondary" size="sm" icon={<Plus size={15} />} onClick={addMapping}>{t("Добавить колонку", "Баған қосу", "Add column")}</Button>
              </div>
              <label className={styles.check}><input type="checkbox" checked={reverseSign} onChange={(event) => setReverseSign(event.target.checked)} />{t("Продажи в файле записаны отрицательным количеством", "Файлдағы сатылымдар теріс мөлшермен жазылған", "Sales in the file use negative quantities")}</label>
            </div></details>
            <Button type="submit" variant="primary" icon={<FileUp size={16} strokeWidth={1.8} />} loading={busy === "stage"} disabled={!sourceId || !file || busy !== null}>{t("Загрузить и проверить", "Жүктеп, тексеру", "Upload and check")}</Button>
          </form>
          <p className={styles.hint}>{t("Сначала загрузите категории, поставщиков, склады и товары; затем продажи, остатки и другие факты. До подтверждения рабочие данные не меняются.", "Алдымен санаттарды, жеткізушілерді, қоймаларды және тауарларды; содан кейін сатылымдарды, қорларды және басқа фактілерді жүктеңіз. Растағанға дейін жұмыс деректері өзгермейді.", "Import categories, suppliers, warehouses and products first; then sales, stock and other facts. Working data does not change until you confirm.")}</p>
        </Card>
      </div>
      <ImportHistory batches={batches} sourceNames={sourceNames} onOpen={selectBatch} page={importPage} hasNext={importsHasNext} loading={loading} onPageChange={setImportPage} />
      {batchId ? <Card title={detail ? `${t("Проверка", "Тексеру", "Check")}: ${detail.filename}` : t("Проверка файла", "Файлды тексеру", "File check")} subtitle={detail ? `${localizedKindName(detail.kind, t)} · ${detail.row_count} ${t("строк", "жол", "rows")} · ${t("версия источника", "дереккөз нұсқасы", "source version")} ${detail.base_revision}` : t("Загружаем результат", "Нәтиже жүктелуде", "Loading result")} actions={<Button variant="ghost" size="sm" onClick={() => selectBatch(null)}>{t("Закрыть", "Жабу", "Close")}</Button>}>
        {detailLoading && !detail ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label={t("Загружаем проверку", "Тексеру жүктелуде", "Loading check")} /> : null}
        {detail ? <div className={styles.detail}>
          <Badge tone={detail.status === "applied" ? "success" : detail.status === "invalid" ? "danger" : "warning"}>{localizedStatusName(detail.status, t)}</Badge>
          {detail.errors.length ? <div><h4>{t("Ошибки", "Қателер", "Errors")} ({detail.errors.length})</h4><ul className={styles.errorList}>{detail.errors.slice(0, 20).map((issue, index) => <li key={`${issue.row}-${issue.column}-${index}`}>{importIssueText(issue, t)}</li>)}</ul>{detail.errors.length > 20 ? <p>{t("Показаны первые 20 ошибок.", "Алғашқы 20 қате көрсетілген.", "Showing the first 20 errors.")}</p> : null}</div> : null}
          {detail.preview.length ? <div><h4>{t("Предпросмотр: первые", "Алдын ала қарау: алғашқы", "Preview: first")} {detail.preview.length} {t("из", "/", "of")} {detail.row_count} {t("строк", "жол", "rows")}</h4><div className={styles.tableWrap}><Table><thead><Tr><Th>{t("ID источника", "Дереккөз ID-і", "Source ID")}</Th><Th>{t("Версия", "Нұсқа", "Version")}</Th><Th>{t("Данные", "Деректер", "Data")}</Th></Tr></thead><tbody>{detail.preview.slice(0, 20).map((row, index) => <Tr key={`${String(row.external_id)}-${index}`}><Td>{String(row.external_id ?? "—")}</Td><Td>{String(row.revision ?? "—")}</Td><Td>{previewLabel(row)}</Td></Tr>)}</tbody></Table></div></div> : null}
          {detail.status === "applied" ? <p className={styles.hint}>{t("Данные применены", "Деректер қолданылды", "Data applied")} {formatDate(detail.applied_at, locale)}. {t("Полноту всего источника смотрите в таблице выше.", "Дереккөздің толықтығын жоғарыдағы кестеден қараңыз.", "See the table above for overall source completeness.")}</p> : null}
          {detail.status === "validated" ? <Button variant="dark" icon={<Check size={16} strokeWidth={1.8} />} onClick={() => setApplyOpen(true)}>{t("Применить проверенный файл", "Тексерілген файлды қолдану", "Apply validated file")}</Button> : null}
          {detail.status === "invalid" ? <p className={styles.hint}>{t("Этот файл нельзя применить. Исправьте строки и загрузите новую версию.", "Бұл файлды қолдануға болмайды. Жолдарды түзетіп, жаңа нұсқасын жүктеңіз.", "This file cannot be applied. Fix the rows and upload a new version.")}</p> : null}
        </div> : null}
      </Card> : null}
    </>}
    <Modal id="apply-import" title="Применить импорт" open={applyOpen} closeOnEscape={busy !== "apply"} closeOnBackdrop={busy !== "apply"} showClose={busy !== "apply"} onOpenChange={(open) => { if (busy === "apply") return; if (open) setApplyOpen(true); else closeApplyModal(); }} footer={<><Button variant="secondary" disabled={busy === "apply"} onClick={closeApplyModal}>Вернуться</Button><Button variant="primary" loading={busy === "apply"} onClick={() => void confirmApply()}>Применить файл</Button></>}>
      {error ? <Alert tone="danger" title="Не удалось применить файл">{error}</Alert> : null}
      <ActionPreview items={[`${detail?.row_count ?? 0} проверенных строк попадут в рабочие данные`, "Версия источника изменится; рекомендации можно будет пересчитать"]} note="Если это последняя часть согласованной выгрузки, отметьте её полной." />
      <label className={styles.check}><input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} />Это последняя часть выгрузки — разрешить расчёт</label>
    </Modal>
  </div>;
}
