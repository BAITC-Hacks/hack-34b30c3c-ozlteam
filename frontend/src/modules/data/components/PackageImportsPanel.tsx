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

  return <section className={styles.stack} aria-label={t("Пакеты исходных выгрузок 1С", "Бастапқы 1С экспорт пакеттері", "Source 1C export packages")}>
    <PackageImportForm sources={sources} onUploaded={(result) => { select(result.id); setHistoryReload((current) => current + 1); onChangedRef.current(); }} />
    <Card title={t("Пакеты Excel", "Excel пакеттері", "Excel packages")} subtitle={t("Проверка выполняется в фоне; к её результату можно вернуться после обновления страницы", "Тексеру фондық режимде орындалады; нәтижеге бетті жаңартқаннан кейін оралуға болады", "The check runs in the background; you can return to its result after refreshing the page")} actions={<Button variant="secondary" size="sm" onClick={() => { setHistoryReload((current) => current + 1); setReload((current) => current + 1); }}>{t("Обновить пакеты", "Пакеттерді жаңарту", "Refresh packages")}</Button>}>
      {historyError ? <ErrorState title={t("Не удалось загрузить пакеты", "Пакеттерді жүктеу мүмкін болмады", "Could not load packages")} text={historyError} onRetry={() => setHistoryReload((current) => current + 1)} /> : historyLoading && (!history || history.offset !== offset) ? <PackageSkeleton /> : <div className={styles.stack} aria-busy={historyLoading}>
        {history?.items.length ? <Table wrapperClassName={styles.tableWrap}><thead><Tr><Th>{t("Пакет", "Пакет", "Package")}</Th><Th>{t("Файлов", "Файлдар", "Files")}</Th><Th>{t("Состояние", "Күйі", "Status")}</Th><Th>{t("Результат", "Нәтиже", "Result")}</Th></Tr></thead><tbody>{history.items.map((item) => <Tr key={item.id}><Td>{item.name}<small className={styles.secondary}>{dateText(item.created_at)}</small></Td><Td>{item.files.length}</Td><Td><Badge tone={item.status === "applied" ? "success" : item.status === "failed" ? "danger" : "warning"}>{statusName[item.status]}</Badge></Td><Td><button type="button" className={styles.textButton} onClick={() => select(item.id)}>{t("Открыть", "Ашу", "Open")}<span className="srOnly"> {t("пакет", "пакет", "package")} {item.name} {item.id}</span></button></Td></Tr>)}</tbody></Table> : <EmptyState title={t("Пакетов пока нет", "Әзірге пакеттер жоқ", "No packages yet")} text={t("Выберите исходные XLSX. Нормализованные CSV и XLSX можно загружать отдельно ниже.", "Бастапқы XLSX файлдарын таңдаңыз. Қалыпқа келтірілген CSV және XLSX файлдарын төменде бөлек жүктеуге болады.", "Choose source XLSX files. You can upload normalized CSV and XLSX separately below.")} />}
        <div className={styles.pager}><span>{history?.items.length ? `${offset + 1}–${offset + history.items.length} ${t("из", "/", "of")} ${history.total}` : `${t("Всего", "Барлығы", "Total")}: ${history?.total ?? 0}`}</span><div><Button size="sm" variant="secondary" disabled={historyLoading || offset === 0} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("packages_offset", String(Math.max(0, offset - 10))); return next; })}>{t("Назад", "Артқа", "Previous")}</Button><Button size="sm" variant="secondary" disabled={historyLoading || offset + (history?.items.length ?? 0) >= (history?.total ?? 0)} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("packages_offset", String(offset + 10)); return next; })}>{t("Далее", "Келесі", "Next")}</Button></div></div>
      </div>}
    </Card>
    {packageId ? <Card title={value?.name ?? t("Проверка пакета", "Пакетті тексеру", "Package check")} actions={<Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => select("")}>{t("Закрыть пакет", "Пакетті жабу", "Close package")}</Button>}>
      {error ? <ErrorState title={t("Действие с пакетом не выполнено", "Пакетке қатысты әрекет орындалмады", "Package action failed")} text={error} onRetry={() => setReload((current) => current + 1)} /> : null}
      {!value && !error ? <PackageSkeleton /> : value ? <div className={styles.stack}>
        <div><Badge tone={value.status === "applied" ? "success" : value.status === "failed" ? "danger" : "warning"}>{statusName[value.status]}</Badge><small className={styles.secondary}>{t("Создан", "Жасалды", "Created")} {dateText(value.created_at)}{value.applied_at ? ` · ${t("применён", "қолданылды", "applied")} ${dateText(value.applied_at)}` : ""}</small></div>
        {isRunning(value) ? <div className={styles.progress} role="status" aria-live="polite"><strong>{statusName[value.status]}</strong>{value.status === "applying" && value.row_count > 0 ? <><progress max={value.row_count} value={value.processed_rows} aria-label={t("Применение пакета", "Пакетті қолдану", "Applying package")} /><span>{value.processed_rows.toLocaleString(numberLocale)} {t("из", "/", "of")} {value.row_count.toLocaleString(numberLocale)} {t("строк", "жол", "rows")}</span></> : <p className={styles.hint}>{t("Разбираем листы и сопоставляем товары. Статус обновляется автоматически.", "Парақтар талданып, тауарлар сәйкестендірілуде. Күйі автоматты жаңартылады.", "Parsing sheets and matching products. Status updates automatically.")}</p>}</div> : null}
        {value.error ? <Alert tone="danger" title={t("Пакет не завершён", "Пакет аяқталмады", "Package incomplete")}>{value.error}</Alert> : null}
        {value.status === "failed" ? <div className={styles.actions}><Button variant="secondary" loading={busy === "retry"} disabled={busy !== null} onClick={() => void perform("retry")}>{t("Повторить обработку", "Өңдеуді қайталау", "Retry processing")}</Button></div> : null}
        {["validated", "applied"].includes(value.status) ? <PackageReadiness value={value} /> : null}
        {value.status === "validated" ? <><p className={styles.hint}>{t("Применение сохранит распознанные товары и факты. Исключённые строки останутся в отчёте проверки. Товары с блокирующими ограничениями не станут готовыми к заказу.", "Қолдану танылған тауарлар мен фактілерді сақтайды. Алып тасталған жолдар тексеру есебінде қалады. Тыйым салатын шектеулері бар тауарлар тапсырысқа дайын болмайды.", "Applying saves recognized products and facts. Excluded rows remain in the validation report. Products with blocking limitations will not become ready to order.")}</p><div className={styles.actions}><Button variant="dark" disabled={busy !== null || !!error} onClick={() => setApplyOpen(true)}>{t("Применить проверенный пакет", "Тексерілген пакетті қолдану", "Apply validated package")}</Button></div></> : null}
        {value.status === "applied" ? <nav className={styles.links} aria-label={t("Импортированные данные", "Импортталған деректер", "Imported data")}><Link to={`/data/catalogs?${new URLSearchParams({ tab: "suppliers", source_id: value.source_id, from: `/data?package=${value.id}` })}`}>{t("Открыть поставщиков", "Жеткізушілерді ашу", "Open suppliers")}</Link><Link to={`/data/catalogs?${new URLSearchParams({ tab: "products", source_id: value.source_id, from: `/data?package=${value.id}` })}`}>{t("Открыть товары", "Тауарларды ашу", "Open products")}</Link></nav> : null}
        <details className={styles.settings}><summary>{t("Файлы и условия пакета", "Пакет файлдары мен шарттары", "Package files and terms")}</summary><div className={styles.stack}><ul className={styles.fileList}>{value.files.map((file) => <li key={file.sha256}>{file.name}{file.row_count != null ? ` — ${file.row_count.toLocaleString(numberLocale)} ${t("строк", "жол", "rows")}` : ""}</li>)}</ul><dl className={styles.summary}><div><dt>{t("Дата среза", "Кесім күні", "Snapshot date")}</dt><dd>{String(value.options.as_of ?? "—")}</dd></div><div><dt>{t("Начало истории", "Тарихтың басталуы", "History starts")}</dt><dd>{String(value.options.history_start ?? "—")}</dd></div><div><dt>{t("Тестовый срок поставки", "Тестілік жеткізу мерзімі", "Test lead time")}</dt><dd>{value.options.lead_time_days == null ? t("Не задан", "Көрсетілмеген", "Not set") : `${value.options.lead_time_days} ${t("дн.", "күн", "days")}`}</dd></div><div><dt>{t("Отрицательные строки", "Теріс жолдар", "Negative rows")}</dt><dd>{value.options.negative_sales_policy === "signed_returns" ? t("Возвраты по тестовому правилу", "Тестілік ережеге сай қайтарымдар", "Returns under test rule") : t("Сохранены для проверки", "Тексеру үшін сақталды", "Kept for review")}</dd></div></dl></div></details>
      </div> : null}
    </Card> : null}
    <Modal id="apply-excel-package" title={t("Применить пакет Excel", "Excel пакетін қолдану", "Apply Excel package")} open={applyOpen && value?.status === "validated"} onOpenChange={(open) => { if (!busy) setApplyOpen(open); }} footer={<><Button variant="secondary" disabled={busy !== null} onClick={() => setApplyOpen(false)}>{t("Вернуться к проверке", "Тексеруге оралу", "Return to check")}</Button><Button loading={busy === "apply"} disabled={busy !== null || !value || value.status !== "validated"} onClick={() => void perform("apply")}>{t("Применить пакет", "Пакетті қолдану", "Apply package")}</Button></>}>
      <ActionPreview items={[`${t("Будут сохранены", "Сақталады", "Will save")} ${value?.row_count.toLocaleString(numberLocale) ?? 0} ${t("распознанных строк", "танылған жол", "recognized rows")}`, t("Будут сохранены только распознанные справочники и факты", "Тек танылған анықтамалықтар мен фактілер сақталады", "Only recognized catalogs and facts will be saved"), t("Несопоставленные остатки и поставки останутся в отчёте проверки", "Сәйкестендірілмеген қорлар мен жеткізілімдер тексеру есебінде қалады", "Unmatched stock and deliveries remain in the validation report"), t("Ограничения по данным останутся видны в карточках товаров", "Дерек шектеулері тауар карточкаларында көрініп тұрады", "Data limitations remain visible in product records")]} note={t("Это тестовые выгрузки. Применение пакета не создаёт и не отправляет заказ поставщику.", "Бұл тестілік экспорттар. Пакетті қолдану жеткізушіге тапсырыс жасамайды және жібермейді.", "These are test exports. Applying the package does not create or send an order to a supplier.")} />
    </Modal>
  </section>;
}
