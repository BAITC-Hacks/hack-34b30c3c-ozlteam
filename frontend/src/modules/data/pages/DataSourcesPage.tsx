import { Check, FileUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
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
type MappingRow = { id: number; source: string; target: string };
const statusName: Record<string, string> = { validated: "Проверен", invalid: "Есть ошибки", applied: "Применён" };
const PAGE_SIZE = 20;
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "У вашей роли нет права на это действие.";
    if (error.status === 409) return "Версия источника изменилась после проверки. Загрузите файл заново.";
    if (error.status === 413) return "Файл слишком большой: до 25 МиБ и 10 000 строк.";
    if (error.status === 415) return "Поддерживаются CSV UTF-8 и XLSX.";
  }
  return error instanceof Error ? error.message : "Не удалось выполнить действие.";
}

function importIssueText(issue: RowError): string {
  const location = [issue.sheet, issue.row > 0 ? `строка ${issue.row}` : null, issue.column ? `колонка «${issue.column}»` : null]
    .filter(Boolean).join(" · ");
  const message = issue.message === "Field required"
    ? "Обязательное значение отсутствует. Проверьте заголовок колонки, сопоставление и ячейку."
    : issue.message.startsWith("Input should be a valid integer")
      ? "Ожидается целое число."
      : issue.message.startsWith("Input should be a valid number") || issue.message.startsWith("Input should be a valid decimal")
        ? "Ожидается число."
        : issue.message.startsWith("Input should be a valid datetime")
          ? "Ожидается дата и время с часовым поясом."
          : issue.message.startsWith("Input should be a valid date")
            ? "Ожидается дата."
            : issue.message;
  return location ? `${location}: ${message}` : message;
}

function DataSkeleton() {
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Загружаем источники данных">
    <div><i /><i /><i /></div><div><i /><i /><i /><i /></div>
  </div>;
}

function SourceList({ sources, selectedSourceId, onViewBatches }: { sources: Source[]; selectedSourceId: string | null; onViewBatches: (id: string) => void }) {
  return <Card title="Источники" subtitle="Версия и полнота данных, полученных из 1С или файлов">
    {sources.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>Источник</Th><Th>Версия</Th><Th>Состояние</Th><Th>Синхронизация</Th><Th>Пакеты</Th></Tr></thead><tbody>
      {sources.map((source) => <Tr key={source.id}>
        <Td><strong>{source.name}</strong><small className={styles.muted}>{source.system === "1c" ? "База 1С" : "Файловые выгрузки"}</small></Td>
        <Td>{source.revision}</Td>
        <Td><Badge tone={source.complete ? "success" : "warning"}>{source.complete ? "Полный набор" : "Загрузка не завершена"}</Badge></Td>
        <Td>{formatDate(source.synced_at)}</Td>
        <Td><button className={styles.textButton} type="button" aria-pressed={selectedSourceId === source.id} onClick={() => onViewBatches(source.id)}>{selectedSourceId === source.id ? "Скрыть" : "Журнал"}<span className="srOnly"> источника {source.name}</span></button></Td>
      </Tr>)}
    </tbody></Table></div> : <EmptyState title="Источников пока нет" text="Зарегистрируйте базу 1С или источник файловых выгрузок." />}
  </Card>;
}

function ImportHistory({ batches, sourceNames, onOpen, page, hasNext, loading, onPageChange }: { batches: ImportBatch[]; sourceNames: Map<string, string>; onOpen: (id: string) => void; page: number; hasNext: boolean; loading: boolean; onPageChange: (page: number) => void }) {
  return <Card title="История загрузок" subtitle="Проверенные файлы и результаты применения">
    {batches.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>Файл</Th><Th>Источник</Th><Th>Строк</Th><Th>Состояние</Th><Th>Проверка</Th></Tr></thead><tbody>
      {batches.map((batch) => <Tr key={batch.id}>
        <Td><strong>{batch.filename}</strong><small className={styles.muted}>{kindName.get(batch.kind) ?? batch.kind} · {formatDate(batch.created_at)}</small></Td>
        <Td>{sourceNames.get(batch.source_id) ?? batch.source_id.slice(0, 8)}</Td>
        <Td>{batch.row_count}</Td>
        <Td><Badge tone={batch.status === "applied" ? "success" : batch.status === "invalid" ? "danger" : "warning"}>{statusName[batch.status] ?? batch.status}</Badge></Td>
        <Td><button className={styles.textButton} type="button" onClick={() => onOpen(batch.id)}>Открыть<span className="srOnly"> {batch.filename}</span></button></Td>
      </Tr>)}
    </tbody></Table></div> : loading ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label="Загружаем историю" /> : <EmptyState title={page ? "На этой странице загрузок нет" : "Файлы ещё не загружались"} text={page ? "Вернитесь к предыдущей странице." : "Выберите источник и загрузите нормализованный CSV или XLSX."} />}
    {(page > 0 || hasNext) ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => onPageChange(page - 1)}>Назад</Button><span>Страница {page + 1}</span><Button variant="secondary" size="sm" disabled={!hasNext || loading} onClick={() => onPageChange(page + 1)}>Далее</Button></div> : null}
  </Card>;
}

function ExchangeHistory({ source, batches, page, hasNext, loading, error, onPageChange, onClose }: { source: Source; batches: ExchangeBatch[]; page: number; hasNext: boolean; loading: boolean; error: string | null; onPageChange: (page: number) => void; onClose: () => void }) {
  return <Card title={`Пакеты источника: ${source.name}`} subtitle="Журнал успешно применённых нормализованных пакетов; регистрация источника сама по себе не подключает 1С" actions={<Button variant="ghost" size="sm" onClick={onClose}>Закрыть</Button>}>
    {error ? <Alert tone="danger" title="Не удалось загрузить журнал">{error}</Alert> : null}
    {loading ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label="Загружаем пакеты источника" /> : batches.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>Пакет</Th><Th>Ревизия</Th><Th>Строк</Th><Th>Курсор</Th><Th>Применён</Th></Tr></thead><tbody>
      {batches.map((batch) => <Tr key={batch.id}><Td><strong>{batch.batch_key}</strong></Td><Td>{batch.revision}</Td><Td>{batch.row_count}</Td><Td>{batch.cursor ?? "—"}</Td><Td>{formatDate(batch.created_at)}</Td></Tr>)}
    </tbody></Table></div> : !error ? <EmptyState title={page ? "На этой странице пакетов нет" : "Применённых пакетов пока нет"} text={page ? "Вернитесь к предыдущей странице." : "Пакеты появятся после обмена через внешний адаптер 1С."} /> : null}
    {(page > 0 || hasNext) ? <div className={styles.pagination}><Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => onPageChange(page - 1)}>Назад</Button><span>Страница {page + 1}</span><Button variant="secondary" size="sm" disabled={!hasNext || loading} onClick={() => onPageChange(page + 1)}>Далее</Button></div> : null}
  </Card>;
}

function previewLabel(row: Record<string, unknown>): string {
  return [row.name, row.sku, row.product_external_id, row.quantity, row.date ?? row.as_of ?? row.expected_date]
    .filter((value) => value !== undefined && value !== null).map(String).join(" · ") || "—";
}

export function DataSourcesPage() {
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
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); })
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
      .catch((caught: unknown) => { if (!controller.signal.aborted) setExchangeError(errorText(caught)); })
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
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [batchId]);

  async function addSource() {
    if (!sourceName.trim()) return;
    setBusy("source"); setError(null); setNotice(null);
    try {
      const added = await createSource(sourceName.trim(), sourceSystem);
      setSourceName(""); setSourceId(added.id); setReload((value) => value + 1);
      setNotice("Источник зарегистрирован. Теперь можно загрузить нормализованный файл.");
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  }

  async function upload() {
    if (!sourceId || !file) return;
    const pairs = mappingRows.map((row) => ({ source: row.source.trim(), target: row.target }));
    if (pairs.some((row) => !row.source || !row.target)) {
      setError("Заполните оба поля каждой пары сопоставления или удалите пустую строку."); return;
    }
    if (new Set(pairs.map((row) => row.source)).size !== pairs.length || new Set(pairs.map((row) => row.target)).size !== pairs.length) {
      setError("Каждую исходную колонку и каждое поле результата можно выбрать только один раз."); return;
    }
    if (pairs.length) {
      const targets = new Set(pairs.map((row) => row.target));
      const missing = format.required.filter((field) => !targets.has(field.name)).map((field) => field.name);
      if (missing.length) { setError(`Добавьте обязательные поля в сопоставление: ${missing.join(", ")}.`); return; }
    }
    const mapping = Object.fromEntries(pairs.map(({ source, target }) => [source, target]));
    setBusy("stage"); setError(null); setNotice(null);
    try {
      const staged = await stageImport({ sourceId, kind, file, mapping: JSON.stringify(mapping), multiplier: reverseSign ? -1 : 1 });
      setFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
      setDetail(staged); selectBatch(staged.id); setImportPage(0); setReload((value) => value + 1);
      setNotice(staged.status === "invalid" ? "Файл проверен: исправьте ошибки и загрузите его снова." : "Файл проверен. Просмотрите строки перед применением.");
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  }

  async function confirmApply() {
    if (!detail || detail.status !== "validated") return;
    setBusy("apply"); setError(null);
    try {
      const applied = await applyImport(detail.id, complete);
      setDetail(applied); closeApplyModal(); setReload((value) => value + 1);
      setNotice(complete ? "Данные применены. Пакет отмечен завершённым; расчёт для полного источника разрешён." : "Данные применены. Пакет остаётся незавершённым до загрузки последней согласованной части.");
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  }

  return <div className={styles.page}>
    <PageHeader title="Источники данных" subtitle="Проверка нормализованных файлов перед расчётом пополнения" actions={<><Button variant="secondary" size="sm" onClick={() => navigate("/data/integrations", { state: { from: `${location.pathname}${location.search}${location.hash}` } })}>Интеграция с 1С</Button><Button variant="secondary" size="sm" icon={<RefreshCw size={15} strokeWidth={1.8} />} onClick={() => setReload((value) => value + 1)}>Обновить</Button></>} />
    {error ? <Alert tone="danger" title="Действие не выполнено" onDismiss={() => setError(null)}>{error}</Alert> : null}
    {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
    <PackageImportsPanel sources={sources} onChanged={() => setReload((value) => value + 1)} />
    {loading && !sources.length && !batches.length ? <DataSkeleton /> : <>
      <SourceList sources={sources} selectedSourceId={selectedSourceId} onViewBatches={viewBatches} />
      {selectedSource ? <ExchangeHistory source={selectedSource} batches={exchangeBatches} page={exchangePage} hasNext={exchangeHasNext} loading={exchangeLoading} error={exchangeError} onPageChange={setExchangePage} onClose={() => setSelectedSourceId(null)} /> : null}
      <div className={styles.forms}>
        <Card title="Зарегистрировать источник" subtitle="Регистрация базы 1С не устанавливает соединение с ней">
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void addSource(); }}>
            <label>Название<input value={sourceName} maxLength={200} required onChange={(event) => setSourceName(event.target.value)} placeholder="Например, 1С Алматы" /></label>
            <Select label="Тип" wrapperClassName={styles.selectField} value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value as "1c" | "file")}><option value="file">Файловые выгрузки</option><option value="1c">База 1С</option></Select>
            <Button type="submit" variant="secondary" icon={<Plus size={16} strokeWidth={1.8} />} loading={busy === "source"} disabled={!sourceName.trim() || busy !== null}>Добавить источник</Button>
          </form>
        </Card>
        <Card title="Загрузить файл" subtitle="CSV UTF-8 или XLSX · до 25 МиБ и 10 000 строк">
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void upload(); }}>
            <Select label="Источник" wrapperClassName={styles.selectField} value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="">Выберите источник</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>
            <Select label="Вид данных" wrapperClassName={styles.selectField} value={kind} onChange={(event) => { setKind(event.target.value); setMappingRows([]); }}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <div className={styles.formatGuide}>
              <strong>Формат: {kindName.get(kind)}</strong>
              <p>Обязательные колонки: <code>{format.required.map((field) => field.name).join(", ")}</code></p>
              <p>Дополнительные: <code>{format.optional.map((field) => field.name).join(", ")}</code></p>
              <p>{format.note}</p>
            </div>
            <label>Файл
              <span className={styles.fileControl}>
                <span className={styles.fileChoose}>Выбрать файл</span>
                <span className={styles.fileName} aria-live="polite">{file?.name ?? "Файл не выбран"}</span>
                <input ref={fileInputRef} type="file" aria-label="Выбрать файл" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
              </span>
            </label>
            <details className={styles.advanced}><summary>Дополнительные настройки</summary><div className={styles.advancedBody}>
              <div className={styles.mappingEditor}>
                <strong>Сопоставление колонок</strong>
                <p className={styles.mappingHint}>Если заголовки файла уже совпадают с полями выше, оставьте список пустым. Если добавили хотя бы одну пару, перечислите <b>все колонки файла, которые хотите сохранить</b>: остальные сервер пропустит. Это переименование колонок, не сопоставление товаров.</p>
                {mappingRows.map((row) => <div className={styles.mappingRow} key={row.id}>
                  <label>Заголовок в файле<input value={row.source} onChange={(event) => changeMapping(row.id, { source: event.target.value })} placeholder="Например, Код записи" /></label>
                  <Select label="Поле результата" wrapperClassName={styles.selectField} value={row.target} onChange={(event) => changeMapping(row.id, { target: event.target.value })}><option value="">Выберите поле</option>{[...format.required, ...format.optional].map((field) => <option key={field.name} value={field.name}>{field.label}</option>)}</Select>
                  <Button type="button" variant="ghost" size="sm" icon={<Trash2 size={15} />} aria-label={`Удалить сопоставление ${row.source || row.id}`} onClick={() => setMappingRows((rows) => rows.filter((item) => item.id !== row.id))}>Удалить</Button>
                </div>)}
                <Button type="button" variant="secondary" size="sm" icon={<Plus size={15} />} onClick={addMapping}>Добавить колонку</Button>
              </div>
              <label className={styles.check}><input type="checkbox" checked={reverseSign} onChange={(event) => setReverseSign(event.target.checked)} />Продажи в файле записаны отрицательным количеством</label>
            </div></details>
            <Button type="submit" variant="primary" icon={<FileUp size={16} strokeWidth={1.8} />} loading={busy === "stage"} disabled={!sourceId || !file || busy !== null}>Загрузить и проверить</Button>
          </form>
          <p className={styles.hint}>Сначала загрузите категории, поставщиков, склады и товары; затем продажи, остатки и другие факты. До подтверждения рабочие данные не меняются.</p>
        </Card>
      </div>
      <ImportHistory batches={batches} sourceNames={sourceNames} onOpen={selectBatch} page={importPage} hasNext={importsHasNext} loading={loading} onPageChange={setImportPage} />
      {batchId ? <Card title={detail ? `Проверка: ${detail.filename}` : "Проверка файла"} subtitle={detail ? `${kindName.get(detail.kind) ?? detail.kind} · ${detail.row_count} строк · версия источника ${detail.base_revision}` : "Загружаем результат"} actions={<Button variant="ghost" size="sm" onClick={() => selectBatch(null)}>Закрыть</Button>}>
        {detailLoading && !detail ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label="Загружаем проверку" /> : null}
        {detail ? <div className={styles.detail}>
          <Badge tone={detail.status === "applied" ? "success" : detail.status === "invalid" ? "danger" : "warning"}>{statusName[detail.status] ?? detail.status}</Badge>
          {detail.errors.length ? <div><h4>Ошибки ({detail.errors.length})</h4><ul className={styles.errorList}>{detail.errors.slice(0, 20).map((issue, index) => <li key={`${issue.row}-${issue.column}-${index}`}>{importIssueText(issue)}</li>)}</ul>{detail.errors.length > 20 ? <p>Показаны первые 20 ошибок.</p> : null}</div> : null}
          {detail.preview.length ? <div><h4>Предпросмотр: первые {detail.preview.length} из {detail.row_count} строк</h4><div className={styles.tableWrap}><Table><thead><Tr><Th>ID источника</Th><Th>Версия</Th><Th>Данные</Th></Tr></thead><tbody>{detail.preview.slice(0, 20).map((row, index) => <Tr key={`${String(row.external_id)}-${index}`}><Td>{String(row.external_id ?? "—")}</Td><Td>{String(row.revision ?? "—")}</Td><Td>{previewLabel(row)}</Td></Tr>)}</tbody></Table></div></div> : null}
          {detail.status === "applied" ? <p className={styles.hint}>Данные применены {formatDate(detail.applied_at)}. Полноту всего источника смотрите в таблице выше.</p> : null}
          {detail.status === "validated" ? <Button variant="dark" icon={<Check size={16} strokeWidth={1.8} />} onClick={() => setApplyOpen(true)}>Применить проверенный файл</Button> : null}
          {detail.status === "invalid" ? <p className={styles.hint}>Этот файл нельзя применить. Исправьте строки и загрузите новую версию.</p> : null}
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
