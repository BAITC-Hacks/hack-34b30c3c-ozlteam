import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

import { Alert, Button, Card, Select } from "../../../shared/ui";
import { uploadPackage } from "../api/packages";
import type { ImportPackage, PackageOptions } from "../api/packages";
import type { Source } from "../types";
import styles from "./PackageImports.module.css";

const warehouseFields = [
  ["iek.monthly_stocks", "IEK: месячные остатки"],
  ["iek.inbound", "IEK: товары в пути"],
  ["systeme.monthly_stocks", "Systeme: месячные остатки"],
  ["systeme.inbound", "Systeme: товары в пути"],
  ["systeme.current_stock", "Systeme: текущий остаток AX / резерв AY"],
] as const;

export function PackageImportForm({ sources, onUploaded }: { sources: Source[]; onUploaded: (value: ImportPackage) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sourceId, setSourceId] = useState("");
  const [name, setName] = useState("Тестовые выгрузки 1С Электрокомплект");
  const [asOf, setAsOf] = useState("2026-09-22");
  const [historyStart, setHistoryStart] = useState("2025-01-01");
  const [revision, setRevision] = useState("1");
  const [leadTime, setLeadTime] = useState("");
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});
  const [negativePolicy, setNegativePolicy] = useState<PackageOptions["negative_sales_policy"]>("quarantine");
  const [moq, setMoq] = useState<"" | "minimum" | "pack">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || !files.length) return;
    if (files.some((file) => !file.name.toLowerCase().endsWith(".xlsx"))) { setError("Для пакета подходят исходные файлы XLSX."); return; }
    const version = Number(revision);
    const days = leadTime.trim() ? Number(leadTime) : null;
    if (!Number.isInteger(version) || version < 1 || (days !== null && (!Number.isInteger(days) || days < 0 || days > 3650))) {
      setError("Укажите положительную целую версию и срок поставки от 0 до 3650 дней либо оставьте срок пустым."); return;
    }
    if (historyStart > asOf) { setError("Начало истории не может быть позже даты среза."); return; }
    setBusy(true); setError(null);
    try {
      const value = await uploadPackage(files, {
        as_of: asOf,
        history_start: historyStart,
        revision: version,
        lead_time_days: days,
        warehouse_mapping: Object.fromEntries(Object.entries(warehouses).filter(([, warehouse]) => warehouse.trim()).map(([key, warehouse]) => [key, warehouse.trim()])),
        negative_sales_policy: negativePolicy,
        moq_semantics: moq || null,
      }, sourceId, name.trim());
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      onUploaded(value);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить пакет. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  }

  return <Card title="Пакет исходных Excel из 1С" subtitle="Загрузите отчёты о продажах, запасах, товарах в пути и условиях поставщиков вместе">
    <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <Alert tone="danger" title="Пакет не загружен">{error}</Alert> : null}
      <div className={styles.form}>
        <label className={styles.full}>Файлы XLSX
          <span className={styles.fileControl}><strong>Выбрать файлы</strong><span aria-live="polite">{files.length ? `Выбрано: ${files.length}` : "Файлы не выбраны"}</span><input ref={fileInput} type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Выбрать файлы пакета XLSX" disabled={busy} required onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></span>
        </label>
        {files.length ? <ul className={`${styles.fileList} ${styles.full}`}>{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}</ul> : null}
        <label>Название пакета<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required disabled={busy} /></label>
        <Select label="Источник данных" value={sourceId} disabled={busy} onChange={(event) => setSourceId(event.target.value)}><option value="">Тестовый источник Электрокомплекта (создаётся один раз)</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>
        <label>Дата среза<input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} required disabled={busy} /></label>
        <label>Начало полной истории отгрузок<input type="date" value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} required disabled={busy} /></label>
      </div>
      <p className={styles.hint}>По умолчанию все пакеты используют один тестовый источник Электрокомплекта, поэтому карточки товаров сохраняют UUID. Для другой базы зарегистрируйте источник ниже и выберите его здесь. Поставщики не становятся отдельными базами 1С.</p>
      <details className={styles.settings}>
        <summary>Условия тестового набора и сопоставление складов</summary>
        <div className={styles.form}>
          <label>Версия выгрузки<input type="number" inputMode="numeric" min="1" step="1" value={revision} onChange={(event) => setRevision(event.target.value)} required disabled={busy} /></label>
          <label>Тестовый срок поставки, дней<input type="number" inputMode="numeric" min="0" max="3650" step="1" value={leadTime} onChange={(event) => setLeadTime(event.target.value)} placeholder="Не задан" disabled={busy} /></label>
          <Select label="Отрицательные количества" value={negativePolicy} disabled={busy} onChange={(event) => setNegativePolicy(event.target.value as PackageOptions["negative_sales_policy"])}><option value="quarantine">На проверку, исключить из спроса</option><option value="signed_returns">Учесть как возвраты (тестовое правило)</option></Select>
          <Select label="Значение колонки MOQ в IEK" value={moq} disabled={busy} onChange={(event) => setMoq(event.target.value as "" | "minimum" | "pack")}><option value="">Не подтверждено</option><option value="minimum">Минимальная партия</option><option value="pack">Кратность заказа</option></Select>
          <p className={`${styles.hint} ${styles.full}`}>Если в отчёте склад не указан, введите название склада Электрокомплекта для этой части данных. Пустое поле сохраняет ограничение. Для Systeme AX — физический остаток, AY — резерв; дополнительные складские колонки не складываются автоматически.</p>
          {warehouseFields.map(([key, label]) => <label key={key}>{label}<input value={warehouses[key] ?? ""} onChange={(event) => setWarehouses((current) => ({ ...current, [key]: event.target.value }))} placeholder="Название склада из 1С" maxLength={200} disabled={busy} /></label>)}
        </div>
      </details>
      <p className={styles.hint}>Пустые условия не подменяются значениями по умолчанию. Сначала сервис проверит пакет и покажет ограничения по каждому товару; применение потребует отдельного подтверждения.</p>
      <div className={styles.actions}><Button type="submit" icon={<FileUp size={16} strokeWidth={1.8} />} loading={busy} disabled={!files.length || !name.trim()}>Загрузить и проверить пакет</Button></div>
    </form>
  </Card>;
}
