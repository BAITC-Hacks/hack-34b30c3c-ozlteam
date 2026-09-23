import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { RightRail } from "./RightRail";
import styles from "./PageHeader.module.css";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Кнопки раздела. Общий поиск и уведомления рисует сам компонент. */
  actions?: ReactNode;
}

/**
 * Шапка раздела: заголовок и общие элементы окна на одной линии.
 * Каждая страница рендерит её первой — иначе поиск уезжает на отдельный этаж.
 */
export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <header className={styles.head}>
      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle !== undefined ? <p className={styles.sub}>{subtitle}</p> : null}
      </div>

      <div className={styles.tools}>
        {actions}
        <div className={styles.search} aria-hidden="true">
          <Search size={15} strokeWidth={1.8} />
          Поиск
          <span className={styles.kbd}>⌘K</span>
        </div>
        <RightRail />
      </div>
    </header>
  );
}
