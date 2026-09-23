import {
  Bell,
  Bot,
  Building2,
  CheckSquare,
  FileText,
  Scale,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import styles from "./RightRail.module.css";

type RailSection = "agents" | "notifications" | "documents" | "tasks";

interface RailItem {
  id: RailSection;
  label: string;
  title: string;
  icon: ReactNode;
  badge?: number;
}

const RAIL_ITEMS: RailItem[] = [
  {
    id: "agents",
    label: "ИИ-агенты",
    title: "ИИ-агенты",
    icon: <Bot size={19} strokeWidth={1.8} />,
    badge: 3,
  },
  {
    id: "notifications",
    label: "Уведомления",
    title: "Уведомления",
    icon: <Bell size={19} strokeWidth={1.8} />,
    badge: 4,
  },
  {
    id: "documents",
    label: "Документы",
    title: "Документы",
    icon: <FileText size={19} strokeWidth={1.8} />,
  },
  {
    id: "tasks",
    label: "Мои задачи",
    title: "Мои задачи",
    icon: <CheckSquare size={19} strokeWidth={1.8} />,
  },
];

function AgentsPanel() {
  return (
    <div className={styles.list}>
      <div className={styles.agentRow}>
        <span className={`${styles.agentIcon} ${styles.builder}`} aria-hidden="true">
          <Building2 size={17} strokeWidth={1.8} />
        </span>
        <span className={styles.rowText}>
          <b>Диспетчер</b>
          <span>Следит за отправками в пути и сроками прибытия</span>
        </span>
        <span className={styles.status}>В работе</span>
      </div>
      <div className={styles.agentRow}>
        <span className={`${styles.agentIcon} ${styles.lawyer}`} aria-hidden="true">
          <Scale size={17} strokeWidth={1.8} />
        </span>
        <span className={styles.rowText}>
          <b>Юрист</b>
          <span>Подготовил претензию по недостаче на складе Алматы</span>
        </span>
        <span className={styles.ready}>Готово</span>
      </div>
      <div className={styles.agentRow}>
        <span className={`${styles.agentIcon} ${styles.financier}`} aria-hidden="true">
          <WalletCards size={17} strokeWidth={1.8} />
        </span>
        <span className={styles.rowText}>
          <b>Тарифы</b>
          <span>Сравнивает ставки перевозчиков по направлениям</span>
        </span>
        <span className={styles.quiet}>Нет новых</span>
      </div>
    </div>
  );
}

function NotificationsPanel() {
  return (
    <div className={styles.list}>
      <div className={styles.noticeRow}>
        <span className={`${styles.dot} ${styles.danger}`} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>Расхождение при приёмке</b>
          <span>18 паллет вместо 20 · склад Алматы</span>
          <small>11:24 · Диспетчер</small>
        </span>
      </div>
      <div className={styles.noticeRow}>
        <span className={`${styles.dot} ${styles.warning}`} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>Ставка ждёт согласования</b>
          <span>Алматы — Астана, сборный груз · 1 872 000 ₸</span>
          <small>10:02 · Тарифы</small>
        </span>
      </div>
      <div className={styles.noticeRow}>
        <span className={`${styles.dot} ${styles.info}`} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>Прогноз прибытия пересчитан</b>
          <span>Простой на Хоргосе · плюс двое суток</span>
          <small>08:15 · Маршруты</small>
        </span>
      </div>
    </div>
  );
}

function DocumentsPanel() {
  return (
    <div className={styles.list}>
      <div className={styles.fileRow}>
        <span className={styles.fileIcon} aria-hidden="true"><FileText size={17} strokeWidth={1.8} /></span>
        <span className={styles.rowText}>
          <b>CMR KZ-1176.pdf</b>
          <span>Загружен диспетчером · 2,4 МБ</span>
        </span>
        <span className={styles.ready}>Готов</span>
      </div>
      <div className={styles.fileRow}>
        <span className={styles.fileIcon} aria-hidden="true"><FileText size={17} strokeWidth={1.8} /></span>
        <span className={styles.rowText}>
          <b>Реестр отправок за сентябрь.xlsx</b>
          <span>Проверено 184 позиции</span>
        </span>
        <span className={styles.quiet}>Сегодня</span>
      </div>
      <div className={styles.fileRow}>
        <span className={styles.fileIcon} aria-hidden="true"><FileText size={17} strokeWidth={1.8} /></span>
        <span className={styles.rowText}>
          <b>Акт скрытых работ.docx</b>
          <span>Черновик · изменён в 09:46</span>
        </span>
        <span className={styles.status}>Черновик</span>
      </div>
    </div>
  );
}

function TasksPanel() {
  return (
    <div className={styles.list}>
      <div className={styles.taskRow}>
        <span className={styles.taskCheck} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>Согласовать ставку перевозчика</b>
          <span>До 14:00 · высокий приоритет</span>
        </span>
      </div>
      <div className={styles.taskRow}>
        <span className={styles.taskCheck} aria-hidden="true" />
        <span className={styles.rowText}>
          <b>Проверить акт недостачи</b>
          <span>Сегодня · склад Алматы</span>
        </span>
      </div>
      <div className={styles.taskRow}>
        <span className={`${styles.taskCheck} ${styles.taskDone}`} aria-hidden="true">
          <CheckSquare size={14} strokeWidth={1.8} />
        </span>
        <span className={`${styles.rowText} ${styles.completed}`}>
          <b>Передать претензию перевозчику</b>
          <span>Выполнено в 09:20</span>
        </span>
      </div>
    </div>
  );
}

function PanelContent({ section }: { section: RailSection }) {
  if (section === "agents") return <AgentsPanel />;
  if (section === "notifications") return <NotificationsPanel />;
  if (section === "documents") return <DocumentsPanel />;
  return <TasksPanel />;
}

export function RightRail() {
  const panelId = useId();
  const [activeSection, setActiveSection] = useState<RailSection>("agents");
  const [isOpen, setIsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const activeItem = RAIL_ITEMS.find((item) => item.id === activeSection) ?? RAIL_ITEMS[0];

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    // Выпадающая панель закрывается и щелчком мимо — иначе она остаётся висеть.
    const closeOnOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutside);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutside);
    };
  }, [isOpen]);

  const selectSection = (section: RailSection) => {
    if (section === activeSection && isOpen) {
      setIsOpen(false);
      return;
    }

    setActiveSection(section);
    setIsOpen(true);
  };

  return (
    <div className={styles.rail} ref={root}>
      <aside
        id={panelId}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
        role="dialog"
        aria-modal="false"
        aria-label={activeItem.title}
        aria-hidden={!isOpen}
      >
        <header className={styles.panelHeader}>
          <div>
            <h2>{activeItem.title}</h2>
            <p>{activeSection === "agents" ? "Ассистенты по сферам" : "Рабочее пространство объекта"}</p>
          </div>
          <button className={styles.closeButton} type="button" aria-label="Закрыть панель" onClick={() => setIsOpen(false)}>
            <X size={17} strokeWidth={1.8} />
          </button>
        </header>
        <PanelContent section={activeSection} />
      </aside>

      <nav className={styles.tabs} aria-label="Быстрые разделы">
        {RAIL_ITEMS.map((item) => {
          const isActive = isOpen && activeSection === item.id;

          return (
            <button
              key={item.id}
              className={styles.tab}
              type="button"
              aria-label={`${item.label}${item.badge ? `, ${item.badge} новых` : ""}`}
              aria-expanded={isActive}
              aria-controls={panelId}
              onClick={() => selectSection(item.id)}
            >
              {item.icon}
              {item.badge ? <span className={styles.badge} aria-hidden="true">{item.badge}</span> : null}
              <span className={styles.tooltip} role="tooltip">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
