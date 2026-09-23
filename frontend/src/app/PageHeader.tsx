import type { ReactNode } from "react";

import { GlobalSearch } from "../modules/global-search";
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
        <GlobalSearch />
        <RightRail />
      </div>
    </header>
  );
}
