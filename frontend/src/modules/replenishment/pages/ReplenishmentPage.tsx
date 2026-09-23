import { Check, Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { PageHeader } from "../../../app/PageHeader";
import { ActionPreview, Alert, Button, Card, EmptyState, ErrorState, Modal, Tile } from "../../../shared/ui";
import { calculate, downloadTemplate, getDemo, importWorkbook } from "../api/replenishment";
import { RecommendationGroup, recommendationKey } from "../components/RecommendationGroup";
import { exportOrdersCsv } from "../lib/exportCsv";
import type { CalculationInput, CalculationResult, Recommendation } from "../types";
import styles from "./ReplenishmentPage.module.css";

const number = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

function LoadingScreen() {
  return (
    <div className={styles.loadingRegion} role="status" aria-busy="true" aria-label="Загружаем данные и считаем рекомендации">
      <div className={styles.skeletonStats} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div className={styles.skeletonTile} key={index}><i /><i /><i /></div>)}
      </div>
      <div className={styles.skeletonCard} aria-hidden="true">
        <i className={styles.skeletonTitle} />
        <i className={styles.skeletonSubtitle} />
        <div className={styles.skeletonRow}><i /><i /><i /></div>
        <div className={styles.skeletonRow}><i /><i /><i /></div>
      </div>
      <span className="srOnly">Загружаем данные и считаем рекомендации…</span>
    </div>
  );
}

export function ReplenishmentPage() {
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
        setError(message(caught));
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
      if (requestVersion.current === version) setError(message(caught));
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
      if (requestVersion.current === version) setError(message(caught));
    } finally {
      if (requestVersion.current === version) setBusy(null);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Выберите файл .xlsx по шаблону для загрузки.");
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
      if (requestVersion.current === version) setError(message(caught));
    } finally {
      if (requestVersion.current === version) setBusy(null);
    }
  }

  async function handleTemplate() {
    setBusy("template");
    setError(null);
    try { await downloadTemplate(); }
    catch (caught) { setError(message(caught)); }
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
        title="Пополнение склада"
        subtitle="Расчёт заказов поставщикам по спросу, остаткам и товарам в пути"
        actions={<Button variant="dark" size="sm" icon={<RefreshCw size={15} strokeWidth={1.8} />} loading={busy === "calculate"} disabled={!input || busy !== null} onClick={() => input && void runCalculation(input)}>Рассчитать</Button>}
      />

      <Card className={styles.sourceCard} title="Исходные данные" subtitle={source === "demo" ? "Сейчас открыт демонстрационный набор" : "Загружена ваша таблица"}>
        <div className={styles.sourceBody}>
          <div className={styles.sourceFacts}>
            {input ? <>
              <span>Дата расчёта: <b>{input.as_of}</b></span>
              <span>Товары: <b>{number(input.products.length)}</b></span>
              <span>Продажи: <b>{number(input.sales.length)}</b></span>
              <span>Склады: <b>{new Set(input.stock.map((item) => item.warehouse)).size}</b></span>
              <span>Товары в пути: <b>{number(input.inbound.length)}</b></span>
            </> : <span>Подготовка данных…</span>}
          </div>
          <div className={styles.sourceActions}>
            <input ref={fileRef} className={styles.fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Загрузить XLSX с данными" onChange={(event) => void handleFile(event)} />
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet size={15} strokeWidth={1.8} />} loading={busy === "template"} disabled={busy !== null} onClick={() => void handleTemplate()}>Шаблон XLSX</Button>
            <Button variant="secondary" size="sm" icon={<Upload size={15} strokeWidth={1.8} />} loading={busy === "import"} disabled={busy !== null} onClick={() => fileRef.current?.click()}>Загрузить XLSX</Button>
            <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void loadDemo()}>Вернуть демо</Button>
          </div>
        </div>
      </Card>

      {error ? <Alert tone="danger" title="Не удалось выполнить действие" action={<Button variant="secondary" size="sm" onClick={() => input ? void runCalculation(input) : void loadDemo()}>Повторить расчёт</Button>}>{error}</Alert> : null}

      {busy && !result ? <LoadingScreen /> : result ? <>
        <div className={styles.stats} aria-label="Итоги расчёта">
          <Tile label="Позиций к заказу" value={number(approvedRows.length)} hint={`Поставщиков: ${groups.length}`} />
          <Tile label="Объём заказа" value={`${number(orderUnits)} шт.`} hint="с учётом ручных правок" />
          <Tile label="Риск дефицита" value={number(criticalCount)} hint="критичные позиции" tone={criticalCount ? "warn" : "good"} />
          <Tile label="Разовых единиц исключено" value={number(spikeUnits)} hint={`Stockout учтён: ${stockoutCount} поз.`} />
        </div>

        <div className={styles.sectionHead}>
          <div><h2>Рекомендации поставщикам</h2><p>Проверьте обоснование и количество. Ноль исключает позицию из выгрузки.</p></div>
          <span>Расчёт на {result.as_of}</span>
        </div>

        {rows.length ? <div className={styles.groups}>{groups.map(([supplierId, supplier]) => <RecommendationGroup key={supplierId} supplier={supplier.name} rows={supplier.rows} quantities={quantities} onQuantityChange={changeQuantity} />)}</div> : <EmptyState title="Заказы не требуются" text="По текущим данным все позиции обеспечены запасом и товарами в пути." action={<Button variant="secondary" onClick={() => input && void runCalculation(input)}>Пересчитать</Button>} />}

        {rows.length ? <Card className={styles.approvalCard} title="Проверка и утверждение" subtitle="Решение остаётся за менеджером закупа">
          <div className={styles.approvalBody}>
            <p>К выгрузке: {approvedRows.length} позиций, {number(orderUnits)} шт. Заказы поставщикам автоматически не отправляются.</p>
            <div className={styles.approvalActions}>
              <Button variant="primary" icon={<Check size={16} strokeWidth={1.8} />} disabled={approvedRows.length === 0 || busy !== null || approved} onClick={() => setPreviewOpen(true)}>{approved ? "Утверждено" : "Просмотреть и утвердить"}</Button>
              <Button variant="secondary" icon={<Download size={16} strokeWidth={1.8} />} disabled={!approved || approvedRows.length === 0} onClick={() => exportOrdersCsv(rows, quantities, result.as_of)}>Скачать CSV</Button>
            </div>
          </div>
          {approved ? <Alert tone="success" title="Заказ утверждён локально">Скачайте CSV для загрузки в учётную систему. Поставщикам ничего не отправлено.</Alert> : null}
        </Card> : null}
      </> : !busy ? <ErrorState title="Нет данных для расчёта" text="Загрузите демо или таблицу по шаблону." onRetry={() => void loadDemo()} /> : null}

      <Modal id="replenishment-approval" title="Утвердить заказ" open={previewOpen} onOpenChange={setPreviewOpen} size="md" footer={<><Button variant="secondary" onClick={() => setPreviewOpen(false)}>Вернуться к правкам</Button><Button variant="primary" onClick={() => { setApproved(true); setPreviewOpen(false); }}>Подтвердить</Button></>}>
        <ActionPreview items={groups.filter(([, supplier]) => supplier.rows.some((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0)).map(([, supplier]) => `${supplier.name}: ${supplier.rows.filter((row) => (quantities[recommendationKey(row)] ?? row.recommended_qty) > 0).length} позиций, ${number(supplier.rows.reduce((sum, row) => sum + (quantities[recommendationKey(row)] ?? row.recommended_qty), 0))} шт.`)} note="Подтверждение действует только в этой вкладке. Заказ не отправляется автоматически; после подтверждения доступен экспорт CSV." />
      </Modal>
    </div>
  );
}
