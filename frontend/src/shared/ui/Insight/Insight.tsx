import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Insight.module.css";

export type InsightTone = "info" | "warning" | "danger";

export interface InsightProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Вывод одной строкой: что именно происходит. */
  title: ReactNode;
  /** Почему это так и что с этим делать. Без этого строка бесполезна. */
  detail?: ReactNode;
  /** Иконка слева, lucide-react, штрих 1.8. */
  icon?: ReactNode;
  tone?: InsightTone;
  /** Кнопка справа. Действие модели всегда подтверждает человек. */
  action?: ReactNode;
}

/**
 * Строка-вывод под блоком: называет смысл цифр над ней и следующий шаг.
 * Не для статуса операции — для этого есть `Badge` и состояния блока.
 */
export function Insight({
  title,
  detail,
  icon,
  tone = "info",
  action,
  className,
  ...rest
}: InsightProps) {
  return (
    <div {...rest} className={cx(styles.insight, styles[tone], className)}>
      {icon !== undefined ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className={styles.body}>
        <b className={styles.title}>{title}</b>
        {detail !== undefined ? <p className={styles.detail}>{detail}</p> : null}
      </div>
      {action !== undefined ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
