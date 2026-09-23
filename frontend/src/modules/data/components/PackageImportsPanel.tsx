import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ActionPreview, Alert, Badge, Button, Card, EmptyState, ErrorState, Modal, Table, Td, Th, Tr } from "../../../shared/ui";
import { useI18n } from "../../../shared/i18n/I18nContext";
import { applyPackage, getPackage, listPackages, retryPackage } from "../api/packages";
import type { ImportPackage, PackagePage, PackageStatus } from "../api/packages";
import type { Source } from "../types";
import { PackageImportForm } from "./PackageImportForm";
import { PackageReadiness, PackageSkeleton } from "./PackageReadiness";
import styles from "./PackageImports.module.css";

const isRunning = (value: ImportPackage) => ["queued", "parsing", "applying"].includes(value.status);

export function PackageImportsPanel({ sources, onChanged }: { sources: Source[]; onChanged: () => void }) {
  const { locale, t } = useI18n();
  const numberLocale = locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU";
  const statusName: Record<PackageStatus, string> = { queued: t("В очереди", "Кезекте", "Queued"), parsing: t("Проверяем файлы", "Файлдар тексерілуде", "Checking files"), validated: t("Проверен, ожидает применения", "Тексерілді, қолдануды күтуде", "Checked, awaiting application"), applying: t("Применяем данные", "Деректер қолданылуда", "Applying data"), applied: t("Применён", "Қолданылды", "Applied"), failed: t("Не завершён", "Аяқталмады", "Incomplete") };
  const dateText = (value: string) => new Date(value).toLocaleString(numberLocale, { dateStyle: "short", timeStyle: "short" });
  const errorText = (error: unknown) => error instanceof Error ? error.message : t("Не удалось получить пакет. Попробуйте ещё раз.", "Пакетті алу мүмкін болмады. Қайталап көріңіз.", "Could not load the package. Try again.");
  const [params, setParams] = useSearchParams();
  const packageId = params.get("package") ?? "";
  const rawOffset = Number(params.get("packages_offset") ?? 0);
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const [history, setHistory] = useState<PackagePage<ImportPackage> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyReload, setHistoryReload] = useState(0);
  const [value, setValue] = useState<ImportPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<"apply" | "retry" | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const onChangedRef = useRef(onChanged);
  const lastStatus = useRef("");
  const selectedIdRef = useRef(packageId);
  onChangedRef.current = onChanged;
  selectedIdRef.current = packageId;

  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true); setHistoryError(null);
    listPackages(offset, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setHistory(result); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setHistoryError(errorText(caught)); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [offset, historyReload, t]);

  useEffect(() => {
    setApplyOpen(false); setError(null); setValue(null);
    lastStatus.current = "";
  }, [packageId]);

  useEffect(() => {
    if (!packageId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function poll() {
      try {
        const next = await getPackage(packageId, controller.signal);
        if (controller.signal.aborted) return;
        setValue(next); setError(null);
        if (lastStatus.current !== `${next.id}:${next.status}`) {
          lastStatus.current = `${next.id}:${next.status}`;
          setHistoryReload((current) => current + 1);
          if (next.status === "applied") onChangedRef.current();
        }
        if (isRunning(next)) timer = window.setTimeout(() => { void poll(); }, 2000);
      } catch (caught) { if (!controller.signal.aborted) setError(errorText(caught)); }
    }
    void poll();
    return () => { controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [packageId, reload, t]);

  function select(id: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("package", id); else next.delete("package");
      ["package_tab", "package_status", "package_q", "package_offset"].forEach((key) => next.delete(key));
      return next;
    });
  }

  async function perform(action: "apply" | "retry") {
    if (!value || busy) return;
    const selectedId = value.id;
    setBusy(action); setError(null);
    try {
      const result = await (action === "apply" ? applyPackage(selectedId) : retryPackage(selectedId));
      if (selectedIdRef.current !== selectedId) return;
      setValue((current) => current?.id === selectedId ? result : current);
      setApplyOpen(false); setReload((current) => current + 1); setHistoryReload((current) => current + 1);
    } catch (caught) { if (selectedIdRef.current === selectedId) { setError(errorText(caught)); setApplyOpen(false); } }
    finally { setBusy(null); }
  }

  return <section className={styles.stack} aria-label="Пакеты исходных выгрузок 1С">
    <PackageImportForm sources={sources} onUploaded={(result) => { select(result.id); setHistoryReload((current) => current + 1); onChangedRef.current(); }} />
    <Card title="Пакеты Excel" subtitle="Проверка выполняется в фоне; к её результату можно вернуться после обновления страницы" actions={<Button variant="secondary" size="sm" onClick={() => { setHistoryReload((current) => current + 1); setReload((current) => current + 1); }}>Обновить пакеты</Button>}>
      {historyError ? <ErrorState title="Не удалось загрузить пакеты" text={historyError} onRetry={() => setHistoryReload((current) => current + 1)} /> : historyLoading && (!history || history.offset !== offset) ? <PackageSkeleton /> : <div className={styles.stack} aria-busy={historyLoading}>
        {history?.items.length ? <Table wrapperClassName={styles.tableWrap}><thead><Tr><Th>Пакет</Th><Th>Файлов</Th><Th>Состояние</Th><Th>Результат</Th></Tr></thead><tbody>{history.items.map((item) => <Tr key={item.id}><Td>{item.name}<small className={styles.secondary}>{dateText(item.created_at)}</small></Td><Td>{item.files.length}</Td><Td><Badge tone={item.status === "applied" ? "success" : item.status === "failed" ? "danger" : "warning"}>{statusName[item.status]}</Badge></Td><Td><button type="button" className={styles.textButton} onClick={() => select(item.id)}>Открыть<span className="srOnly"> пакет {item.name} {item.id}</span></button></Td></Tr>)}</tbody></Table> : <EmptyState title="Пакетов пока нет" text="Выберите исходные XLSX. Нормализованные CSV и XLSX можно загружать отдельно ниже." />}
        <div className={styles.pager}><span>{history?.items.length ? `${offset + 1}–${offset + history.items.length} из ${history.total}` : `Всего: ${history?.total ?? 0}`}</span><div><Button size="sm" variant="secondary" disabled={historyLoading || offset === 0} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("packages_offset", String(Math.max(0, offset - 10))); return next; })}>Назад</Button><Button size="sm" variant="secondary" disabled={historyLoading || offset + (history?.items.length ?? 0) >= (history?.total ?? 0)} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("packages_offset", String(offset + 10)); return next; })}>Далее</Button></div></div>
      </div>}
    </Card>
    {packageId ? <Card title={value?.name ?? "Проверка пакета"} actions={<Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => select("")}>Закрыть пакет</Button>}>
      {error ? <ErrorState title="Действие с пакетом не выполнено" text={error} onRetry={() => setReload((current) => current + 1)} /> : null}
      {!value && !error ? <PackageSkeleton /> : value ? <div className={styles.stack}>
        <div><Badge tone={value.status === "applied" ? "success" : value.status === "failed" ? "danger" : "warning"}>{statusName[value.status]}</Badge><small className={styles.secondary}>Создан {dateText(value.created_at)}{value.applied_at ? ` · применён ${dateText(value.applied_at)}` : ""}</small></div>
        {isRunning(value) ? <div className={styles.progress} role="status" aria-live="polite"><strong>{statusName[value.status]}</strong>{value.status === "applying" && value.row_count > 0 ? <><progress max={value.row_count} value={value.processed_rows} aria-label="Применение пакета" /><span>{value.processed_rows.toLocaleString("ru-RU")} из {value.row_count.toLocaleString("ru-RU")} строк</span></> : <p className={styles.hint}>Разбираем листы и сопоставляем товары. Статус обновляется автоматически.</p>}</div> : null}
        {value.error ? <Alert tone="danger" title="Пакет не завершён">{value.error}</Alert> : null}
        {value.status === "failed" ? <div className={styles.actions}><Button variant="secondary" loading={busy === "retry"} disabled={busy !== null} onClick={() => void perform("retry")}>Повторить обработку</Button></div> : null}
        {["validated", "applied"].includes(value.status) ? <PackageReadiness value={value} /> : null}
        {value.status === "validated" ? <><p className={styles.hint}>Применение сохранит распознанные товары и факты. Исключённые строки останутся в отчёте проверки. Товары с блокирующими ограничениями не станут готовыми к заказу.</p><div className={styles.actions}><Button variant="dark" disabled={busy !== null || !!error} onClick={() => setApplyOpen(true)}>Применить проверенный пакет</Button></div></> : null}
        {value.status === "applied" ? <nav className={styles.links} aria-label="Импортированные данные"><Link to={`/data/catalogs?${new URLSearchParams({ tab: "suppliers", source_id: value.source_id, from: `/data?package=${value.id}` })}`}>Открыть поставщиков</Link><Link to={`/data/catalogs?${new URLSearchParams({ tab: "products", source_id: value.source_id, from: `/data?package=${value.id}` })}`}>Открыть товары</Link></nav> : null}
        <details className={styles.settings}><summary>Файлы и условия пакета</summary><div className={styles.stack}><ul className={styles.fileList}>{value.files.map((file) => <li key={file.sha256}>{file.name}{file.row_count != null ? ` — ${file.row_count.toLocaleString("ru-RU")} строк` : ""}</li>)}</ul><dl className={styles.summary}><div><dt>Дата среза</dt><dd>{String(value.options.as_of ?? "—")}</dd></div><div><dt>Начало истории</dt><dd>{String(value.options.history_start ?? "—")}</dd></div><div><dt>Тестовый срок поставки</dt><dd>{value.options.lead_time_days == null ? "Не задан" : `${value.options.lead_time_days} дн.`}</dd></div><div><dt>Отрицательные строки</dt><dd>{value.options.negative_sales_policy === "signed_returns" ? "Возвраты по тестовому правилу" : "Сохранены для проверки"}</dd></div></dl></div></details>
      </div> : null}
    </Card> : null}
    <Modal id="apply-excel-package" title="Применить пакет Excel" open={applyOpen && value?.status === "validated"} onOpenChange={(open) => { if (!busy) setApplyOpen(open); }} footer={<><Button variant="secondary" disabled={busy !== null} onClick={() => setApplyOpen(false)}>Вернуться к проверке</Button><Button loading={busy === "apply"} disabled={busy !== null || !value || value.status !== "validated"} onClick={() => void perform("apply")}>Применить пакет</Button></>}>
      <ActionPreview items={[`Будут сохранены ${value?.row_count.toLocaleString("ru-RU") ?? 0} распознанных строк`, "Будут сохранены только распознанные справочники и факты", "Несопоставленные остатки и поставки останутся в отчёте проверки", "Ограничения по данным останутся видны в карточках товаров"]} note="Это тестовые выгрузки. Применение пакета не создаёт и не отправляет заказ поставщику." />
    </Modal>
  </section>;
}
