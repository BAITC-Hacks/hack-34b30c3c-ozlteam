import { Bell, CheckSquare, FileText, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { listOrders } from "../modules/orders/api/orders";
import type { SupplierOrder } from "../modules/orders/types";
import { getRuns } from "../modules/replenishment/api/runs";
import type { Run } from "../modules/replenishment/runTypes";
import { DocumentsPanel } from "../modules/rail-documents";
import { useI18n } from "../shared/i18n/I18nContext";
import type { Locale } from "../shared/i18n/I18nContext";
import styles from "./RightRail.module.css";

type RailSection = "notifications" | "documents" | "tasks";

interface RailItem {
  id: RailSection;
  label: string;
  icon: ReactNode;
}

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function ActivityPanel({
  section, orders, runs, loading, error, onRefresh, onNavigate, hasMoreTasks, loadingMoreTasks, moreError, onLoadMoreTasks,
}: {
  section: "notifications" | "tasks";
  orders: SupplierOrder[];
  runs: Run[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNavigate: () => void;
  hasMoreTasks: boolean;
  loadingMoreTasks: boolean;
  moreError: string | null;
  onLoadMoreTasks: () => void;
}) {
  const { locale, t } = useI18n();
  const drafts = orders.filter((order) => order.status === "draft");
  const recentRuns = runs.filter((run) => run.status === "done" || run.status === "failed").slice(0, 5);
  if (loading) return <div className={styles.skeleton} role="status" aria-busy="true" aria-label={t("Загружаем данные", "Деректер жүктелуде", "Loading data")}>{[0, 1, 2].map((index) => <div key={index}><i /><span><i /><i /></span></div>)}</div>;
  if (error) return <div className={styles.feedback} role="alert"><p>{error}</p><button type="button" onClick={onRefresh}>{t("Повторить", "Қайталау", "Retry")}</button></div>;

  if (section === "tasks") {
    return drafts.length ? <div className={styles.list}>
      {drafts.map((order) => <Link key={order.id} className={styles.actionRow} to={`/orders?id=${order.id}`} onClick={onNavigate}>
        <span className={styles.taskCheck} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>{t("Проверить заказ", "Тапсырысты тексеру", "Review order")}: {order.supplier_name}</b>
          <span>{t("Позиций", "Позициялар", "Items")}: {order.lines.length} · {t("черновик ожидает решения", "жоба шешімді күтуде", "draft awaiting review")}</span>
          <small>{t("Создан", "Жасалды", "Created")} {formatDate(order.created_at, locale)}</small>
        </span>
      </Link>)}
      {hasMoreTasks ? <button className={styles.moreLink} type="button" disabled={loadingMoreTasks} onClick={onLoadMoreTasks}>{loadingMoreTasks ? t("Загружаем…", "Жүктелуде…", "Loading…") : t("Показать ещё", "Тағы көрсету", "Show more")}</button> : null}
      {moreError ? <p className={styles.footnote} role="alert">{moreError} {t("Повторите загрузку.", "Жүктеуді қайталаңыз.", "Try loading again.")}</p> : null}
      <Link className={styles.moreLink} to="/orders?status=draft" onClick={onNavigate}>{t("Открыть список черновиков", "Жобалар тізімін ашу", "Open draft orders")}</Link>
    </div> : <div className={styles.feedback}><p>{t("Черновиков на согласование нет.", "Бекітуді күтетін жобалар жоқ.", "No drafts awaiting review.")}</p><Link to="/recommendations" onClick={onNavigate}>{t("Открыть расчёты", "Есептеулерді ашу", "Open calculations")}</Link></div>;
  }

  const events = [
    ...drafts.map((order) => ({ id: `order-${order.id}`, date: order.created_at, title: `${t("Новый черновик", "Жаңа жоба", "New draft")}: ${order.supplier_name}`, detail: `${t("Позиций", "Позициялар", "Items")}: ${order.lines.length} · ${t("требуется проверка", "тексеру қажет", "review required")}`, to: `/orders?id=${order.id}`, tone: "warning" })),
    ...recentRuns.map((run) => ({ id: `run-${run.id}`, date: run.completed_at ?? run.created_at, title: run.status === "failed" ? t("Ошибка расчёта пополнения", "Толықтыру есебінің қатесі", "Replenishment calculation failed") : t("Расчёт пополнения готов", "Толықтыру есебі дайын", "Replenishment calculation ready"), detail: run.status === "failed" ? run.error ?? t("Откройте расчёт для подробностей", "Толығырақ көру үшін есепті ашыңыз", "Open the calculation for details") : `${t("На дату", "Күні", "As of")} ${run.as_of}`, to: `/recommendations?run=${run.id}`, tone: run.status === "failed" ? "danger" : "info" })),
  ].sort((first, second) => second.date.localeCompare(first.date)).slice(0, 10);

  return events.length ? <div className={styles.list}>
    {events.map((event) => <Link key={event.id} className={styles.actionRow} to={event.to} onClick={onNavigate}>
      <span className={`${styles.dot} ${styles[event.tone]}`} aria-hidden="true" />
      <span className={styles.rowText}><b>{event.title}</b><span>{event.detail}</span><small>{formatDate(event.date, locale)}</small></span>
    </Link>)}
  </div> : <div className={styles.feedback}><p>{t("Событий по расчётам и заказам пока нет.", "Есептеулер мен тапсырыстар бойынша әзірге оқиға жоқ.", "No calculation or order activity yet.")}</p><Link to="/recommendations" onClick={onNavigate}>{t("Открыть расчёты", "Есептеулерді ашу", "Open calculations")}</Link></div>;
}

export function RightRail() {
  const { t } = useI18n();
  const railItems: RailItem[] = [
    { id: "notifications", label: t("События", "Оқиғалар", "Activity"), icon: <Bell size={19} strokeWidth={1.8} /> },
    { id: "documents", label: t("Документы", "Құжаттар", "Documents"), icon: <FileText size={19} strokeWidth={1.8} /> },
    { id: "tasks", label: t("Мои задачи", "Менің тапсырмаларым", "My tasks"), icon: <CheckSquare size={19} strokeWidth={1.8} /> },
  ];
  const panelId = useId();
  const [activeSection, setActiveSection] = useState<RailSection>("notifications");
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [tasksOffset, setTasksOffset] = useState(0);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [loadingMoreTasks, setLoadingMoreTasks] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const moreController = useRef<AbortController | null>(null);
  const activeItem = railItems.find((item) => item.id === activeSection) ?? railItems[0];

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
    const closeOnOutside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setIsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutside);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.removeEventListener("mousedown", closeOnOutside); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || (activeSection !== "notifications" && activeSection !== "tasks")) return;
    const controller = new AbortController();
    moreController.current?.abort();
    setLoadingMoreTasks(false);
    setMoreError(null);
    setLoading(true);
    setError(null);
    if (activeSection === "tasks") { setTasksOffset(0); setHasMoreTasks(false); }
    Promise.all([listOrders(activeSection === "tasks" ? "draft" : "all", 0, controller.signal), activeSection === "tasks" ? Promise.resolve(null) : getRuns(0, controller.signal)])
      .then(([nextOrders, nextRuns]) => { setOrders(nextOrders); if (nextRuns) setRuns(nextRuns.items); if (activeSection === "tasks") { setTasksOffset(nextOrders.length); setHasMoreTasks(nextOrders.length === 20); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : t("Не удалось загрузить данные.", "Деректерді жүктеу мүмкін болмады.", "Could not load data.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [activeSection, isOpen, refresh]);

  async function loadMoreTasks() {
    if (loadingMoreTasks || !hasMoreTasks) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMoreTasks(true);
    setMoreError(null);
    try {
      const next = await listOrders("draft", tasksOffset, controller.signal);
      if (controller.signal.aborted) return;
      setOrders((current) => [...current, ...next.filter((item) => !current.some((loaded) => loaded.id === item.id))]);
      setTasksOffset((current) => current + next.length);
      setHasMoreTasks(next.length === 20);
    } catch (caught) {
      if (!controller.signal.aborted) setMoreError(caught instanceof Error ? caught.message : t("Не удалось загрузить черновики.", "Жобаларды жүктеу мүмкін болмады.", "Could not load drafts."));
    } finally {
      if (!controller.signal.aborted) setLoadingMoreTasks(false);
    }
  }

  const selectSection = (section: RailSection) => {
    if (section === activeSection && isOpen) { setIsOpen(false); return; }
    setActiveSection(section);
    setIsOpen(true);
  };

  return <div className={styles.rail} ref={root}>
    <aside id={panelId} className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`} role="dialog" aria-modal="false" aria-label={activeItem.label} aria-hidden={!isOpen}>
      <header className={styles.panelHeader}>
        <div><h2>{activeItem.label}</h2><p>{activeSection === "notifications" ? t("Последние расчёты и заказы", "Соңғы есептеулер мен тапсырыстар", "Recent calculations and orders") : activeSection === "tasks" ? t("Черновики на проверку", "Тексерілетін жобалар", "Drafts to review") : t("Загруженные файлы", "Жүктелген файлдар", "Uploaded files")}</p></div>
        {(activeSection === "notifications" || activeSection === "tasks") && <button className={styles.closeButton} type="button" aria-label={t("Обновить данные", "Деректерді жаңарту", "Refresh data")} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={17} strokeWidth={1.8} /></button>}
        <button className={styles.closeButton} type="button" aria-label={t("Закрыть панель", "Панельді жабу", "Close panel")} onClick={() => setIsOpen(false)}><X size={17} strokeWidth={1.8} /></button>
      </header>
      {activeSection === "documents" ? <DocumentsPanel /> : <ActivityPanel section={activeSection} orders={orders} runs={runs} loading={loading} error={error} onRefresh={() => setRefresh((value) => value + 1)} onNavigate={() => setIsOpen(false)} hasMoreTasks={hasMoreTasks} loadingMoreTasks={loadingMoreTasks} moreError={moreError} onLoadMoreTasks={() => void loadMoreTasks()} />}
    </aside>
    <nav className={styles.tabs} aria-label={t("Быстрые разделы", "Жылдам бөлімдер", "Quick sections")}>
      {railItems.map((item) => <button key={item.id} className={styles.tab} type="button" aria-label={item.label} aria-expanded={isOpen && activeSection === item.id} aria-controls={panelId} onClick={() => selectSection(item.id)}>
        {item.icon}<span className={styles.tooltip} role="tooltip">{item.label}</span>
      </button>)}
    </nav>
  </div>;
}
