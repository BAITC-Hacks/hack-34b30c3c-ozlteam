import type { HTMLAttributes, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cx } from "../cx";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Что именно пусто, человеческими словами. */
  title: ReactNode;
  /** Приглашение к действию, одна-две строки. */
  text?: ReactNode;
  /** Одна кнопка. Больше одного действия в пустом состоянии не ставится. */
  action?: ReactNode;
  /** Иконка вместо стандартной (lucide-react, штрих 1.8). */
  icon?: ReactNode;
}

export function EmptyState({
  title,
  text,
  action,
  icon,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div {...rest} className={cx(styles.state, className)}>
      <span className={styles.icon} aria-hidden="true">
        {icon ?? <Inbox size={20} strokeWidth={1.8} />}
      </span>
      <h4 className={styles.title}>{title}</h4>
      {text !== undefined ? <p className={styles.text}>{text}</p> : null}
      {action !== undefined ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
