import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Alert.module.css";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode | false;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const toneIcons: Record<AlertTone, ReactNode> = {
  info: <Info size={18} strokeWidth={1.8} />,
  success: <CircleCheck size={18} strokeWidth={1.8} />,
  warning: <TriangleAlert size={18} strokeWidth={1.8} />,
  danger: <CircleAlert size={18} strokeWidth={1.8} />,
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  icon,
  onDismiss,
  dismissLabel = "Закрыть уведомление",
  className,
  role,
  ...props
}: AlertProps) {
  return (
    <div
      {...props}
      className={cx(styles.alert, styles[tone], className)}
      role={role ?? (tone === "danger" ? "alert" : "status")}
    >
      {icon !== false ? (
        <span className={styles.icon} aria-hidden="true">{icon ?? toneIcons[tone]}</span>
      ) : null}
      <div className={styles.content}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.message}>{children}</div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      {onDismiss ? (
        <button className={styles.dismiss} type="button" aria-label={dismissLabel} onClick={onDismiss}>
          <X size={16} strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}
