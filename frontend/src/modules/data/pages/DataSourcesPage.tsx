import { Check, FileUp, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "../../../app/PageHeader";
import { ApiError } from "../../../shared/api/client";
import { ActionPreview, Alert, Badge, Button, Card, EmptyState, Modal, Table, Td, Th, Tr } from "../../../shared/ui";
import { applyImport, createSource, getImport, listImports, listSources, stageImport } from "../api/data";
import type { ImportBatch, ImportDetail, RowError, Source } from "../types";
import styles from "./DataSourcesPage.module.css";

const kinds = [
  ["categories", "Категории"], ["suppliers", "Поставщики"], ["warehouses", "Склады"],
  ["products", "Товары"], ["sales", "Продажи"], ["stocks", "Остатки"],
  ["inbound", "Товары в пути"], ["stockouts", "Отсутствие товара"], ["growth", "Прирост спроса"],
] as const;

const kindName = new Map<string, string>(kinds);
const statusName: Record<string, string> = { validated: "Проверен", invalid: "Есть ошибки", applied: "Применён" };
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

function SourceList({ sources }: { sources: Source[] }) {
  return <Card title="Источники" subtitle="Версия и полнота данных, полученных из 1С или файлов">
    {sources.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>Источник</Th><Th>Версия</Th><Th>Состояние</Th><Th>Синхронизация</Th></Tr></thead><tbody>
      {sources.map((source) => <Tr key={source.id}>
        <Td><strong>{source.name}</strong><small className={styles.muted}>{source.system === "1c" ? "База 1С" : "Файловые выгрузки"}</small></Td>
        <Td>{source.revision}</Td>
        <Td><Badge tone={source.complete ? "success" : "warning"}>{source.complete ? "Полный набор" : "Загрузка не завершена"}</Badge></Td>
        <Td>{formatDate(source.synced_at)}</Td>
      </Tr>)}
    </tbody></Table></div> : <EmptyState title="Источников пока нет" text="Зарегистрируйте базу 1С или источник файловых выгрузок." />}
  </Card>;
}

function ImportHistory({ batches, sourceNames, onOpen }: { batches: ImportBatch[]; sourceNames: Map<string, string>; onOpen: (id: string) => void }) {
  return <Card title="История загрузок" subtitle="Последние 50 проверенных файлов и результаты применения">
    {batches.length ? <div className={styles.tableWrap}><Table><thead><Tr><Th>Файл</Th><Th>Источник</Th><Th>Строк</Th><Th>Состояние</Th><Th>Проверка</Th></Tr></thead><tbody>
      {batches.map((batch) => <Tr key={batch.id}>
        <Td><strong>{batch.filename}</strong><small className={styles.muted}>{kindName.get(batch.kind) ?? batch.kind} · {formatDate(batch.created_at)}</small></Td>
        <Td>{sourceNames.get(batch.source_id) ?? batch.source_id.slice(0, 8)}</Td>
        <Td>{batch.row_count}</Td>
        <Td><Badge tone={batch.status === "applied" ? "success" : batch.status === "invalid" ? "danger" : "warning"}>{statusName[batch.status] ?? batch.status}</Badge></Td>
        <Td><button className={styles.textButton} type="button" onClick={() => onOpen(batch.id)}>Открыть<span className="srOnly"> {batch.filename}</span></button></Td>
      </Tr>)}
    </tbody></Table></div> : <EmptyState title="Файлы ещё не загружались" text="Выберите источник и загрузите нормализованный CSV или XLSX." />}
  </Card>;
}

function previewLabel(row: Record<string, unknown>): string {
  return [row.name, row.sku, row.product_external_id, row.quantity, row.date ?? row.as_of ?? row.expected_date]
    .filter((value) => value !== undefined && value !== null).map(String).join(" · ") || "—";
}

export function DataSourcesPage() {
  const [params, setParams] = useSearchParams();
  const batchId = params.get("import");
  const [sources, setSources] = useState<Source[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
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
  const [mapping, setMapping] = useState("");
  const [reverseSign, setReverseSign] = useState(false);
  const [complete, setComplete] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const sourceNames = useMemo(() => new Map(sources.map((source) => [source.id, source.name])), [sources]);

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
    Promise.all([listSources(controller.signal), listImports(controller.signal)]).then(([nextSources, nextBatches]) => {
      setSources(nextSources);
      setBatches(nextBatches);
      setSourceId((current) => current || nextSources[0]?.id || "");
      setError(null);
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

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
    let parsed: unknown;
    try { parsed = JSON.parse(mapping.trim() || "{}"); }
    catch { setError("Сопоставление колонок должно быть JSON-словарём."); return; }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || Object.entries(parsed).some(([key, value]) => !key || typeof value !== "string")) {
      setError("Сопоставление колонок должно быть JSON-словарём строк."); return;
    }
    setBusy("stage"); setError(null); setNotice(null);
    try {
      const staged = await stageImport({ sourceId, kind, file, mapping: JSON.stringify(parsed), multiplier: reverseSign ? -1 : 1 });
      setFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
      setDetail(staged); selectBatch(staged.id); setReload((value) => value + 1);
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
      setNotice("Файл применён. Версия источника обновлена.");
    } catch (caught) { closeApplyModal(); setError(errorText(caught)); }
    finally { setBusy(null); }
  }

  return <div className={styles.page}>
    <PageHeader title="Источники данных" subtitle="Проверка выгрузок 1С перед расчётом пополнения" actions={<Button variant="secondary" size="sm" icon={<RefreshCw size={15} strokeWidth={1.8} />} onClick={() => setReload((value) => value + 1)}>Обновить</Button>} />
    {error ? <Alert tone="danger" title="Действие не выполнено" onDismiss={() => setError(null)}>{error}</Alert> : null}
    {notice ? <Alert tone="success" onDismiss={() => setNotice(null)}>{notice}</Alert> : null}
    {loading && !sources.length && !batches.length ? <DataSkeleton /> : <>
      <SourceList sources={sources} />
      <div className={styles.forms}>
        <Card title="Зарегистрировать источник" subtitle="Регистрация базы 1С не устанавливает соединение с ней">
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void addSource(); }}>
            <label>Название<input value={sourceName} maxLength={200} required onChange={(event) => setSourceName(event.target.value)} placeholder="Например, 1С Алматы" /></label>
            <label>Тип<select value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value as "1c" | "file")}><option value="file">Файловые выгрузки</option><option value="1c">База 1С</option></select></label>
            <Button type="submit" variant="secondary" icon={<Plus size={16} strokeWidth={1.8} />} loading={busy === "source"} disabled={!sourceName.trim() || busy !== null}>Добавить источник</Button>
          </form>
        </Card>
        <Card title="Загрузить файл" subtitle="CSV UTF-8 или XLSX · до 25 МиБ и 10 000 строк">
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void upload(); }}>
            <label>Источник<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} required><option value="">Выберите источник</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
            <label>Вид данных<select value={kind} onChange={(event) => setKind(event.target.value)}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Файл<input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
            <details className={styles.advanced}><summary>Дополнительные настройки</summary><div className={styles.advancedBody}>
              <label>Сопоставление колонок (JSON)<textarea value={mapping} onChange={(event) => setMapping(event.target.value)} rows={3} placeholder={'{"Исходная колонка":"external_id"}'} /></label>
              <label className={styles.check}><input type="checkbox" checked={reverseSign} onChange={(event) => setReverseSign(event.target.checked)} />Продажи в файле записаны отрицательным количеством</label>
            </div></details>
            <Button type="submit" variant="primary" icon={<FileUp size={16} strokeWidth={1.8} />} loading={busy === "stage"} disabled={!sourceId || !file || busy !== null}>Загрузить и проверить</Button>
          </form>
          <p className={styles.hint}>Сначала загрузите категории, поставщиков, склады и товары; затем продажи, остатки и другие факты. До подтверждения рабочие данные не меняются.</p>
        </Card>
      </div>
      <ImportHistory batches={batches} sourceNames={sourceNames} onOpen={selectBatch} />
      {batchId ? <Card title={detail ? `Проверка: ${detail.filename}` : "Проверка файла"} subtitle={detail ? `${kindName.get(detail.kind) ?? detail.kind} · ${detail.row_count} строк · версия источника ${detail.base_revision}` : "Загружаем результат"} actions={<Button variant="ghost" size="sm" onClick={() => selectBatch(null)}>Закрыть</Button>}>
        {detailLoading && !detail ? <div className={styles.skeletonRow} role="status" aria-busy="true" aria-label="Загружаем проверку" /> : null}
        {detail ? <div className={styles.detail}>
          <Badge tone={detail.status === "applied" ? "success" : detail.status === "invalid" ? "danger" : "warning"}>{statusName[detail.status] ?? detail.status}</Badge>
          {detail.errors.length ? <div><h4>Ошибки ({detail.errors.length})</h4><ul className={styles.errorList}>{detail.errors.slice(0, 20).map((issue, index) => <li key={`${issue.row}-${issue.column}-${index}`}>{importIssueText(issue)}</li>)}</ul>{detail.errors.length > 20 ? <p>Показаны первые 20 ошибок.</p> : null}</div> : null}
          {detail.preview.length ? <div><h4>Первые строки</h4><div className={styles.tableWrap}><Table><thead><Tr><Th>ID источника</Th><Th>Версия</Th><Th>Данные</Th></Tr></thead><tbody>{detail.preview.slice(0, 20).map((row, index) => <Tr key={`${String(row.external_id)}-${index}`}><Td>{String(row.external_id ?? "—")}</Td><Td>{String(row.revision ?? "—")}</Td><Td>{previewLabel(row)}</Td></Tr>)}</tbody></Table></div></div> : null}
          {detail.status === "validated" ? <Button variant="dark" icon={<Check size={16} strokeWidth={1.8} />} onClick={() => setApplyOpen(true)}>Применить проверенный файл</Button> : null}
          {detail.status === "invalid" ? <p className={styles.hint}>Этот файл нельзя применить. Исправьте строки и загрузите новую версию.</p> : null}
        </div> : null}
      </Card> : null}
    </>}
    <Modal id="apply-import" title="Применить импорт" open={applyOpen} onOpenChange={(open) => { if (open) setApplyOpen(true); else closeApplyModal(); }} footer={<><Button variant="secondary" onClick={closeApplyModal}>Вернуться</Button><Button variant="primary" loading={busy === "apply"} onClick={() => void confirmApply()}>Применить файл</Button></>}>
      <ActionPreview items={[`${detail?.row_count ?? 0} проверенных строк попадут в рабочие данные`, "Версия источника изменится; рекомендации можно будет пересчитать"]} note="Если это последняя часть согласованной выгрузки, отметьте её полной." />
      <label className={styles.check}><input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} />Это последняя часть выгрузки — разрешить расчёт</label>
    </Modal>
  </div>;
}
