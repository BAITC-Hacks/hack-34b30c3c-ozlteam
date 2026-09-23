import { Check, Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { PageHeader } from "../../../app/PageHeader";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { ActionPreview, Alert, Button, Card, EmptyState, ErrorState, Modal, Tile } from "../../../shared/ui";
import { calculate, downloadTemplate, getDemo, importWorkbook } from "../api/replenishment";
import { RecommendationGroup, recommendationKey } from "../components/RecommendationGroup";
import { exportOrdersCsv } from "../lib/exportCsv";
import type { CalculationInput, CalculationResult, Recommendation } from "../types";
import styles from "./ReplenishmentPage.module.css";

const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

function message(error: unknown, t: ReturnType<typeof useI18n>["t"]): string {
  return error instanceof Error ? error.message : t("Не удалось выполнить запрос. Попробуйте ещё раз.", "Сұрау орындалмады. Қайта көріңіз.", "Request failed. Try again.");
}

function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div className={styles.loadingRegion} role="status" aria-busy="true" aria-label={t("Загружаем данные и считаем рекомендации", "Деректер жүктеліп, ұсынымдар есептелуде", "Loading data and calculating recommendations")}>
      <div className={styles.skeletonStats} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div className={styles.skeletonTile} key={index}><i /><i /><i /></div>)}
      </div>
      <div className={styles.skeletonCard} aria-hidden="true">
        <i className={styles.skeletonTitle} />
        <i className={styles.skeletonSubtitle} />
        <div className={styles.skeletonRow}><i /><i /><i /></div>
        <div className={styles.skeletonRow}><i /><i /><i /></div>
      </div>
      <span className="srOnly">{t("Загружаем данные и считаем рекомендации…", "Деректер жүктеліп, ұсынымдар есептелуде…", "Loading data and calculating recommendations…")}</span>
    </div>
  );
}

export function ReplenishmentPage() {
  const { t, locale } = useI18n();
  const [input, setInput] = useState<CalculationInput | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [source, setSource] = useState<"demo" | "file">("demo");
  const [busy, setBusy] = useState<"demo" | "import" | "calculate" | "template" | null>("demo");
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    async function load() {
      try {
        const demo = await getDemo(controller.signal);
        const next = await calculate(demo, controller.signal);
        if (requestVersion.current !== version) return;
        setInput(demo);
        setResult(next);
        setQuantities({});
      } catch (caught) {
        if (controller.signal.aborted || requestVersion.current !== version) return;
        setError(message(caught, t));
      } finally {
        if (requestVersion.current === version) setBusy(null);
      }
    }
    void load();
    return () => { controller.abort(); requestVersion.current++; };
  }, []);

  async function loadDemo() {
    const version = ++requestVersion.current;
    setBusy("demo");
    setError(null);
    setApproved(false);
    try {
      const demo = await getDemo();
      const next = await calculate(demo);
      if (requestVersion.current !== version) return;
      setInput(demo);
      setResult(next);
      setQuantities({});
      setSource("demo");
    } catch (caught) {
      if (requestVersion.current === version) setError(message(caught, t));
    } finally {
      if (requestVersion.current === version) setBusy(null);
    }
  }

  async function runCalculation(data: CalculationInput) {
    const version = ++requestVersion.current;
    setBusy("calculate");
    setError(null);
    setApproved(false);
    try {
      const next = await calculate(data);
      if (requestVersion.current !== version) return;
      setResult(next);
      setQuantities({});
    } catch (caught) {
      if (requestVersion.current === version) setError(message(caught, t));
    } finally {
      if (requestVersion.current === version) setBusy(null);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError(t('Выберите файл .xlsx по шаблону для загрузки.', 'Жүктеу үшін үлгіге сай .xlsx файлын таңдаңыз.', 'Select a template based .xlsx file to upload.'));
      return;
    }
    const version = ++requestVersion.current;
    setBusy("import");
    setError(null);
    setApproved(false);
    try {
      const imported = await importWorkbook(file);
      if (requestVersion.current !== version) return;
      setInput(imported);
      setResult(null);
      setQuantities({});
      setSource("file");
      setBusy("calculate");
      const next = await calculate(imported);
      if (requestVersion.current !== version) return;
      setResult(next);
      setQuantities({});
    } catch (caught) {
      if (requestVersion.current === version) setError(message(caught, t));
    } finally {
      if (requestVersion.current === version) setBusy(null);
    }
  }

  async function handleTemplate() {
    setBusy("template");
    setError(null);
    try { await downloadTemplate(); }
    catch (caught) { setError(message(caught, t)); }
    finally { setBusy(null); }
  }

  const rows = result?.recommendations ?? [];
  const groups = useMemo(() => {
    const bySupplier = new Map<string, { name: string; rows: Recommendation[] }>();
    for (const row of rows) {
      const existing = bySupplier.get(row.supplier_id) ?? { name: row.supplier_name, rows: [] };
      existing.rows.push(row);
      bySupplier.set(row.supplier_id, existing);
    }
    return [...bySupplier.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name, "ru"));
  }, [rows]);
  const approvedRows = rows.filter((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0);
  const orderUnits = approvedRows.reduce((sum, row) => sum + (quantities[recommendationKey(row)] ?? row.recommended_qty), 0);
  const criticalCount = rows.filter((row) => row.urgency === "critical").length;
  const spikeUnits = rows.reduce((sum, row) => sum + row.metrics.excluded_spike_units, 0);
  const stockoutCount = rows.filter((row) => row.metrics.lost_demand_units > 0).length;

  function changeQuantity(key: string, quantity: number) {
    setQuantities((current) => ({ ...current, [key]: quantity }));
    setApproved(false);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('Пополнение склада', 'Қойманы толықтыру', 'Warehouse replenishment')}
        subtitle={t('Расчёт заказов поставщикам по спросу, остаткам и товарам в пути', 'Сұраныс, қалдықтар және жолдағы тауарлар негізінде жеткізушілерге тапсырыстарды есептеу', 'Calculate supplier orders from demand, stock and inbound goods')}
        actions={<Button variant="dark" size="sm" icon={<RefreshCw size={15} strokeWidth={1.8} />} loading={busy === "calculate"} disabled={!input || busy !== null} onClick={() => input && void runCalculation(input)}>{t('Рассчитать', 'Есептеу', 'Calculate')}</Button>}
      />

      <Card className={styles.sourceCard} title={t('Исходные данные', 'Бастапқы деректер', 'Source data')} subtitle={source === "demo" ? t('Сейчас открыт демонстрационный набор', 'Қазір демо деректер жиыны ашық', 'Demo dataset is open') : t('Загружена ваша таблица', 'Кестеңіз жүктелді', 'Your workbook is loaded')}>
        <div className={styles.sourceBody}>
          <div className={styles.sourceFacts}>
            {input ? <>
              <span>{t('Дата расчёта: ', 'Есептеу күні: ', 'Calculation date: ')}<b>{input.as_of}</b></span>
              <span>{t('Товары: ', 'Тауарлар: ', 'Products: ')}<b>{number(input.products.length)}</b></span>
              <span>{t('Продажи: ', 'Сатылымдар: ', 'Sales: ')}<b>{number(input.sales.length)}</b></span>
              <span>{t('Склады: ', 'Қоймалар: ', 'Warehouses: ')}<b>{new Set(input.stock.map((item) => item.warehouse)).size}</b></span>
              <span>{t('Товары в пути: ', 'Жолдағы тауарлар: ', 'Inbound goods: ')}<b>{number(input.inbound.length)}</b></span>
            </> : <span>{t('Подготовка данных…', 'Деректер дайындалуда…', 'Preparing data…')}</span>}
          </div>
          <div className={styles.sourceActions}>
            <input ref={fileRef} className={styles.fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label={t('Загрузить XLSX с данными', 'Деректері бар XLSX жүктеу', 'Upload data XLSX')} onChange={(event) => void handleFile(event)} />
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={15} strokeWidth={1.8} />} loading={busy === "template"} disabled={busy !== null} onClick={() => void handleTemplate()}>{t('Шаблон XLSX', 'XLSX үлгісі', 'XLSX template')}</Button>
            <Button variant="secondary" size="sm" icon={<Upload size={15} strokeWidth={1.8} />} loading={busy === "import"} disabled={busy !== null} onClick={() => fileRef.current?.click()}>{t('Загрузить XLSX', 'XLSX жүктеу', 'Upload XLSX')}</Button>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void loadDemo()}>{t('Вернуть демо', 'Демоны қайтару', 'Restore demo')}</Button>
          </div>
        </div>
      </Card>

      {error ? <Alert tone="danger" title={t('Не удалось выполнить действие', 'Әрекет орындалмады', 'Action failed')} action={<Button variant="secondary" size="sm" onClick={() => input ? void runCalculation(input) : void loadDemo()}>{t('Повторить расчёт', 'Есептеуді қайталау', 'Retry calculation')}</Button>}>{error}</Alert> : null}

      {busy && !result ? <LoadingScreen /> : result ? <>
        <div className={styles.stats} aria-label={t('Итоги расчёта', 'Есептеу нәтижесі', 'Calculation results')}>
          <Tile label={t('Позиций к заказу', 'Тапсырысқа позициялар', 'Items to order')} value={number(approvedRows.length)} hint={`${t("Поставщиков:", "Жеткізушілер:", "Suppliers:")} ${groups.length}`} />
          <Tile label={t('Объём заказа', 'Тапсырыс көлемі', 'Order quantity')} value={`${number(orderUnits)} ${t("шт.", "дана", "units")}`} hint={t('с учётом ручных правок', 'қолмен түзетулерді ескере отырып', 'including manual edits')} />
          <Tile label={t('Риск дефицита', 'Тапшылық қаупі', 'Stockout risk')} value={number(criticalCount)} hint={t('критичные позиции', 'шұғыл позициялар', 'critical items')} tone={criticalCount ? "warn" : "good"} />
          <Tile label={t('Разовых единиц исключено', 'Бір реттік бірліктер алынып тасталды', 'One-off units excluded')} value={number(spikeUnits)} hint={`${t("Тапшылық ескерілген:", "Тапшылық ескерілген:", "Stockouts included:")} ${stockoutCount} ${t("поз.", "позиция", "items")}`} />
        </div>

        <div className={styles.sectionHead}>
          <div><h2>{t('Рекомендации поставщикам', 'Жеткізушілерге ұсынымдар', 'Supplier recommendations')}</h2><p>{t('Проверьте обоснование и количество. Ноль исключает позицию из выгрузки.', 'Негіздеме мен санын тексеріңіз. Нөл позицияны экспорттан алып тастайды.', 'Review the rationale and quantity. Zero excludes an item from export.')}</p></div>
          <span>{t("Расчёт на", "Есептеу күні", "Calculated for")} {result.as_of}</span>
        </div>

        {rows.length ? <div className={styles.groups}>{groups.map(([supplierId, supplier]) => <RecommendationGroup key={supplierId} supplier={supplier.name} rows={supplier.rows} quantities={quantities} onQuantityChange={changeQuantity} />)}</div> : <EmptyState title={t('Заказы не требуются', 'Тапсырыс қажет емес', 'No orders needed')} text={t('По текущим данным все позиции обеспечены запасом и товарами в пути.', 'Ағымдағы деректер бойынша барлық позициялар қор мен жолдағы тауарлармен қамтамасыз етілген.', 'Current stock and inbound goods cover all items.')} action={<Button variant="secondary" onClick={() => input && void runCalculation(input)}>{t('Пересчитать', 'Қайта есептеу', 'Recalculate')}</Button>} />}

        {rows.length ? <Card className={styles.approvalCard} title={t('Проверка и утверждение', 'Тексеру және бекіту', 'Review and approval')} subtitle={t('Решение остаётся за менеджером закупа', 'Шешімді сатып алу менеджері қабылдайды', 'The purchasing manager makes the decision')}>
          <div className={styles.approvalBody}>
            <p>{t("К выгрузке:", "Экспортқа:", "To export:")} {approvedRows.length} {t("позиций,", "позиция,", "items,")} {number(orderUnits)} {t("шт.", "дана.", "units.")} {t("Заказы поставщикам автоматически не отправляются.", "Тапсырыстар жеткізушілерге автоматты түрде жіберілмейді.", "Orders are not sent to suppliers automatically.")}</p>
            <div className={styles.approvalActions}>
              <Button variant="primary" icon={<Check size={16} strokeWidth={1.8} />} disabled={approvedRows.length === 0 || busy !== null || approved} onClick={() => setPreviewOpen(true)}>{approved ? t('Утверждено', 'Бекітілді', 'Approved') : t('Просмотреть и утвердить', 'Қарап, бекіту', 'Review and approve')}</Button>
              <Button variant="secondary" icon={<Download size={16} strokeWidth={1.8} />} disabled={!approved || approvedRows.length === 0} onClick={() => exportOrdersCsv(rows, quantities, result.as_of)}>{t('Скачать CSV', 'CSV жүктеу', 'Download CSV')}</Button>
            </div>
          </div>
          {approved ? <Alert tone="success" title={t('Заказ утверждён локально', 'Тапсырыс жергілікті түрде бекітілді', 'Order approved locally')}>{t('Скачайте CSV для загрузки в учётную систему. Поставщикам ничего не отправлено.', 'Есеп жүйесіне жүктеу үшін CSV файлын алыңыз. Жеткізушілерге ештеңе жіберілген жоқ.', 'Download CSV for your accounting system. Nothing has been sent to suppliers.')}</Alert> : null}
        </Card> : null}
      </> : !busy ? <ErrorState title={t('Нет данных для расчёта', 'Есептеуге дерек жоқ', 'No data to calculate')} text={t('Загрузите демо или таблицу по шаблону.', 'Демоны немесе үлгі бойынша кестені жүктеңіз.', 'Load the demo or a workbook based on the template.')} onRetry={() => void loadDemo()} /> : null}

      <Modal id="replenishment-approval" title={t('Утвердить заказ', 'Тапсырысты бекіту', 'Approve order')} open={previewOpen} onOpenChange={setPreviewOpen} size="md" footer={<><Button variant="secondary" onClick={() => setPreviewOpen(false)}>{t('Вернуться к правкам', 'Түзетуге оралу', 'Back to edits')}</Button><Button variant="primary" onClick={() => { setApproved(true); setPreviewOpen(false); }}>{t('Подтвердить', 'Растау', 'Confirm')}</Button></>}>
        <ActionPreview items={groups.filter(([, supplier]) => supplier.rows.some((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0)).map(([, supplier]) => `${supplier.name}: ${supplier.rows.filter((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0).length} ${t("позиций", "позиция", "items")}, ${number(supplier.rows.reduce((sum, row) => sum + (quantities[recommendationKey(row)] ?? row.recommended_qty), 0))} ${t("шт.", "дана", "units")}`)} note={t('Подтверждение действует только в этой вкладке. Заказ не отправляется автоматически; после подтверждения доступен экспорт CSV.', 'Растау тек осы қойындыда жарамды. Тапсырыс автоматты түрде жіберілмейді; растағаннан кейін CSV экспорттауға болады.', 'Approval applies only in this tab. The order is not sent automatically; CSV export becomes available after confirmation.')} />
      </Modal>
    </div>
  );
}
