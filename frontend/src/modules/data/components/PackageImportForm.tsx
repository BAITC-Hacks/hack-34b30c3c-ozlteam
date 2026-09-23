import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

import { Alert, Button, Card, Select } from "../../../shared/ui";
import { useI18n } from "../../../shared/i18n/I18nContext";
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
  const { t } = useI18n();
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
    if (files.some((file) => !file.name.toLowerCase().endsWith(".xlsx"))) { setError(t("Для пакета подходят исходные файлы XLSX.", "Пакетке бастапқы XLSX файлдары қажет.", "The package requires source XLSX files.")); return; }
    const version = Number(revision);
    const days = leadTime.trim() ? Number(leadTime) : null;
    if (!Number.isInteger(version) || version < 1 || (days !== null && (!Number.isInteger(days) || days < 0 || days > 3650))) {
      setError(t("Укажите положительную целую версию и срок поставки от 0 до 3650 дней либо оставьте срок пустым.", "Нұсқаны оң бүтін санмен, ал жеткізу мерзімін 0–3650 күнмен көрсетіңіз немесе мерзімді бос қалдырыңыз.", "Enter a positive whole version number and a lead time of 0–3650 days, or leave lead time blank.")); return;
    }
    if (historyStart > asOf) { setError(t("Начало истории не может быть позже даты среза.", "Тарихтың басталуы кесім күнінен кейін болмауы керек.", "History cannot start after the snapshot date.")); return; }
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("Не удалось загрузить пакет. Попробуйте ещё раз.", "Пакетті жүктеу мүмкін болмады. Қайталап көріңіз.", "Could not upload the package. Try again.")); }
    finally { setBusy(false); }
  }

  return <Card title={t("Пакет исходных Excel из 1С", "1С бастапқы Excel файлдарының пакеті", "Source Excel package from 1C")} subtitle={t("Загрузите отчёты о продажах, запасах, товарах в пути и условиях поставщиков вместе", "Сату, қор, жолдағы тауар және жеткізуші шарттары есептерін бірге жүктеңіз", "Upload sales, stock, inbound and supplier terms reports together")}>
    <form className={styles.stack} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {error ? <Alert tone="danger" title={t("Пакет не загружен", "Пакет жүктелмеді", "Package not uploaded")}>{error}</Alert> : null}
      <div className={styles.form}>
        <label className={styles.full}>{t("Файлы XLSX", "XLSX файлдары", "XLSX files")}
          <span className={styles.fileControl}><strong>{t("Выбрать файлы", "Файлдарды таңдау", "Choose files")}</strong><span aria-live="polite">{files.length ? `${t("Выбрано", "Таңдалды", "Selected")}: ${files.length}` : t("Файлы не выбраны", "Файлдар таңдалмады", "No files selected")}</span><input ref={fileInput} type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label={t("Выбрать файлы пакета XLSX", "Пакетке XLSX файлдарын таңдау", "Choose package XLSX files")} disabled={busy} required onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></span>
        </label>
        {files.length ? <ul className={`${styles.fileList} ${styles.full}`}>{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}</ul> : null}
        <label>{t("Название пакета", "Пакет атауы", "Package name")}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required disabled={busy} /></label>
        <Select label={t("Источник данных", "Дереккөз", "Data source")} value={sourceId} disabled={busy} onChange={(event) => setSourceId(event.target.value)}><option value="">{t("Тестовый источник Электрокомплекта (создаётся один раз)", "Электрокомплект тестілік дереккөзі (бір рет жасалады)", "Elektrokomplekt test source (created once)")}</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select>
        <label>{t("Дата среза", "Кесім күні", "Snapshot date")}<input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} required disabled={busy} /></label>
        <label>{t("Начало полной истории отгрузок", "Жөнелтулердің толық тарихы басталған күн", "Full shipment history starts")}<input type="date" value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} required disabled={busy} /></label>
      </div>
      <p className={styles.hint}>{t("По умолчанию все пакеты используют один тестовый источник Электрокомплекта, поэтому карточки товаров сохраняют UUID. Для другой базы зарегистрируйте источник ниже и выберите его здесь. Поставщики не становятся отдельными базами 1С.", "Әдепкіде барлық пакет Электрокомплекттің бір тестілік дереккөзін қолданады, сондықтан тауар UUID-і сақталады. Басқа база үшін төменде дереккөзді тіркеп, оны осы жерден таңдаңыз. Жеткізушілер жеке 1С базасы болып саналмайды.", "By default, packages share one Elektrokomplekt test source, preserving product UUIDs. For another database, register a source below and select it here. Suppliers are not separate 1C databases.")}</p>
      <details className={styles.settings}>
        <summary>{t("Условия тестового набора и сопоставление складов", "Тестілік жиын шарттары және қоймаларды сәйкестендіру", "Test data terms and warehouse mapping")}</summary>
        <div className={styles.form}>
          <label>{t("Версия выгрузки", "Экспорт нұсқасы", "Export version")}<input type="number" inputMode="numeric" min="1" step="1" value={revision} onChange={(event) => setRevision(event.target.value)} required disabled={busy} /></label>
          <label>{t("Тестовый срок поставки, дней", "Тестілік жеткізу мерзімі, күн", "Test lead time, days")}<input type="number" inputMode="numeric" min="0" max="3650" step="1" value={leadTime} onChange={(event) => setLeadTime(event.target.value)} placeholder={t("Не задан", "Көрсетілмеген", "Not set")} disabled={busy} /></label>
          <Select label={t("Отрицательные количества", "Теріс мөлшерлер", "Negative quantities")} value={negativePolicy} disabled={busy} onChange={(event) => setNegativePolicy(event.target.value as PackageOptions["negative_sales_policy"])}><option value="quarantine">{t("На проверку, исключить из спроса", "Тексеруге жіберу, сұраныстан алып тастау", "Review and exclude from demand")}</option><option value="signed_returns">{t("Учесть как возвраты (тестовое правило)", "Қайтарым ретінде есептеу (тестілік ереже)", "Count as returns (test rule)")}</option></Select>
          <Select label={t("Значение колонки MOQ в IEK", "IEK MOQ бағанының мағынасы", "Meaning of IEK MOQ column")} value={moq} disabled={busy} onChange={(event) => setMoq(event.target.value as "" | "minimum" | "pack")}><option value="">{t("Не подтверждено", "Расталмаған", "Unconfirmed")}</option><option value="minimum">{t("Минимальная партия", "Ең аз партия", "Minimum batch")}</option><option value="pack">{t("Кратность заказа", "Тапсырыс еселігі", "Order multiple")}</option></Select>
          <p className={`${styles.hint} ${styles.full}`}>{t("Если в отчёте склад не указан, введите название склада Электрокомплекта для этой части данных. Пустое поле сохраняет ограничение. Для Systeme AX — физический остаток, AY — резерв; дополнительные складские колонки не складываются автоматически.", "Есепте қойма көрсетілмесе, осы деректер үшін Электрокомплект қоймасының атауын енгізіңіз. Бос өріс шектеуді сақтайды. Systeme үшін AX — нақты қор, AY — резерв; қосымша қойма бағандары автоматты түрде қосылмайды.", "If the report has no warehouse, enter the Elektrokomplekt warehouse name for those records. Leaving it blank keeps the limitation. For Systeme, AX is physical stock and AY is reserved stock; extra warehouse columns are not added automatically.")}</p>
          {warehouseFields.map(([key, label]) => <label key={key}>{key === "systeme.current_stock" ? t(label, "Systeme: ағымдағы қор AX / резерв AY", "Systeme: current stock AX / reserve AY") : key.endsWith("monthly_stocks") ? `${key.startsWith("iek") ? "IEK" : "Systeme"}: ${t("месячные остатки", "айлық қорлар", "monthly stock")}` : `${key.startsWith("iek") ? "IEK" : "Systeme"}: ${t("товары в пути", "жолдағы тауарлар", "inbound goods")}`}<input value={warehouses[key] ?? ""} onChange={(event) => setWarehouses((current) => ({ ...current, [key]: event.target.value }))} placeholder={t("Название склада из 1С", "1С қоймасының атауы", "Warehouse name from 1C")} maxLength={200} disabled={busy} /></label>)}
        </div>
      </details>
      <p className={styles.hint}>{t("Пустые условия не подменяются значениями по умолчанию. Сначала сервис проверит пакет и покажет ограничения по каждому товару; применение потребует отдельного подтверждения.", "Бос шарттар әдепкі мәндермен ауыстырылмайды. Алдымен сервис пакетті тексеріп, әр тауарға қатысты шектеулерді көрсетеді; қолдану үшін бөлек растау керек.", "Missing terms are not replaced with defaults. The service checks the package and shows limitations for each product first; applying it requires separate confirmation.")}</p>
      <div className={styles.actions}><Button type="submit" icon={<FileUp size={16} strokeWidth={1.8} />} loading={busy} disabled={!files.length || !name.trim()}>{t("Загрузить и проверить пакет", "Пакетті жүктеп, тексеру", "Upload and check package")}</Button></div>
    </form>
  </Card>;
}
