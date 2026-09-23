import { Bell, Bot, CheckSquare, FileText, RefreshCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { listOrders } from "../modules/orders/api/orders";
import type { SupplierOrder } from "../modules/orders/types";
import { getRuns } from "../modules/replenishment/api/runs";
import type { Run } from "../modules/replenishment/runTypes";
import { DocumentsPanel } from "../modules/rail-documents";
import styles from "./RightRail.module.css";

type RailSection = "agents" | "notifications" | "documents" | "tasks";

interface RailItem {
  id: RailSection;
  label: string;
  icon: ReactNode;
}

const RAIL_ITEMS: RailItem[] = [
  { id: "agents", label: "ИИ-ассистент", icon: <Bot size={19} strokeWidth={1.8} /> },
  { id: "notifications", label: "События", icon: <Bell size={19} strokeWidth={1.8} /> },
  { id: "documents", label: "Документы", icon: <FileText size={19} strokeWidth={1.8} /> },
  { id: "tasks", label: "Мои задачи", icon: <CheckSquare size={19} strokeWidth={1.8} /> },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AgentsPanel({ onNavigate }: { onNavigate: () => void }) {
  return <div className={styles.list}>
    <Link className={styles.actionRow} to="/assistant" onClick={onNavigate}>
      <span className={styles.agentIcon} aria-hidden="true"><Bot size={18} strokeWidth={1.8} /></span>
      <span className={styles.rowText}>
        <b>Логист ИИ</b>
        <span>Задайте вопрос о расчёте пополнения, заказах и работе с данными.</span>
      </span>
    </Link>
    <p className={styles.footnote}>Ассистент отвечает на вопросы. Решения по заказам утверждает менеджер закупок.</p>
  </div>;
}

function ActivityPanel({
  section, orders, runs, loading, error, onRefresh, onNavigate,
}: {
  section: "notifications" | "tasks";
  orders: SupplierOrder[];
  runs: Run[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNavigate: () => void;
}) {
  const drafts = orders.filter((order) => order.status === "draft");
  const recentRuns = runs.filter((run) => run.status === "done" || run.status === "failed").slice(0, 5);
  if (loading) return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Загружаем данные">{[0, 1, 2].map((index) => <div key={index}><i /><span><i /><i /></span></div>)}</div>;
  if (error) return <div className={styles.feedback} role="alert"><p>{error}</p><button type="button" onClick={onRefresh}>Повторить</button></div>;

  if (section === "tasks") {
    return drafts.length ? <div className={styles.list}>
      {drafts.map((order) => <Link key={order.id} className={styles.actionRow} to={`/orders?id=${order.id}`} onClick={onNavigate}>
        <span className={styles.taskCheck} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>Проверить заказ: {order.supplier_name}</b>
          <span>Позиций: {order.lines.length} · черновик ожидает решения</span>
          <small>Создан {formatDate(order.created_at)}</small>
        </span>
      </Link>)}
      <Link className={styles.moreLink} to="/orders?status=draft" onClick={onNavigate}>Все черновики</Link>
    </div> : <div className={styles.feedback}><p>Черновиков на согласование нет.</p><Link to="/recommendations" onClick={onNavigate}>Открыть расчёты</Link></div>;
  }

  const events = [
    ...drafts.map((order) => ({ id: `order-${order.id}`, date: order.created_at, title: `Новый черновик: ${order.supplier_name}`, detail: `Позиций: ${order.lines.length} · требуется проверка`, to: `/orders?id=${order.id}`, tone: "warning" })),
    ...recentRuns.map((run) => ({ id: `run-${run.id}`, date: run.completed_at ?? run.created_at, title: run.status === "failed" ? "Ошибка расчёта пополнения" : "Расчёт пополнения готов", detail: run.status === "failed" ? run.error ?? "Откройте расчёт для подробностей" : `На дату ${run.as_of}`, to: `/recommendations?run=${run.id}`, tone: run.status === "failed" ? "danger" : "info" })),
  ].sort((first, second) => second.date.localeCompare(first.date)).slice(0, 10);

  return events.length ? <div className={styles.list}>
    {events.map((event) => <Link key={event.id} className={styles.actionRow} to={event.to} onClick={onNavigate}>
      <span className={`${styles.dot} ${styles[event.tone]}`} aria-hidden="true" />
      <span className={styles.rowText}><b>{event.title}</b><span>{event.detail}</span><small>{formatDate(event.date)}</small></span>
    </Link>)}
  </div> : <div className={styles.feedback}><p>Событий по расчётам и заказам пока нет.</p><Link to="/recommendations" onClick={onNavigate}>Открыть расчёты</Link></div>;
}

export function RightRail() {
  const panelId = useId();
  const [activeSection, setActiveSection] = useState<RailSection>("agents");
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const activeItem = RAIL_ITEMS.find((item) => item.id === activeSection) ?? RAIL_ITEMS[0];

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
    setLoading(true);
    setError(null);
    Promise.all([listOrders("all", 0, controller.signal), getRuns(0, controller.signal)])
      .then(([nextOrders, nextRuns]) => { setOrders(nextOrders); setRuns(nextRuns.items); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Не удалось загрузить данные."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activeSection, isOpen, refresh]);

  const selectSection = (section: RailSection) => {
    if (section === activeSection && isOpen) { setIsOpen(false); return; }
    setActiveSection(section);
    setIsOpen(true);
  };

  return <div className={styles.rail} ref={root}>
    <aside id={panelId} className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`} role="dialog" aria-modal="false" aria-label={activeItem.label} aria-hidden={!isOpen}>
      <header className={styles.panelHeader}>
        <div><h2>{activeItem.label}</h2><p>{activeSection === "agents" ? "Помощь по закупкам" : activeSection === "notifications" ? "Последние расчёты и заказы" : activeSection === "tasks" ? "Черновики на проверку" : "Загруженные файлы"}</p></div>
        {(activeSection === "notifications" || activeSection === "tasks") && <button className={styles.closeButton} type="button" aria-label="Обновить данные" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={17} strokeWidth={1.8} /></button>}
        <button className={styles.closeButton} type="button" aria-label="Закрыть панель" onClick={() => setIsOpen(false)}><X size={17} strokeWidth={1.8} /></button>
      </header>
      {activeSection === "agents" ? <AgentsPanel onNavigate={() => setIsOpen(false)} /> : activeSection === "documents" ? <DocumentsPanel /> : <ActivityPanel section={activeSection} orders={orders} runs={runs} loading={loading} error={error} onRefresh={() => setRefresh((value) => value + 1)} onNavigate={() => setIsOpen(false)} />}
    </aside>
    <nav className={styles.tabs} aria-label="Быстрые разделы">
      {RAIL_ITEMS.map((item) => <button key={item.id} className={styles.tab} type="button" aria-label={item.label} aria-expanded={isOpen && activeSection === item.id} aria-controls={panelId} onClick={() => selectSection(item.id)}>
        {item.icon}<span className={styles.tooltip} role="tooltip">{item.label}</span>
      </button>)}
    </nav>
  </div>;
}
