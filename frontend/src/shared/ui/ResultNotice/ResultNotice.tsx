import { Check } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./ResultNotice.module.css";

export interface ResultNoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  action?: ReactNode;
}

export function ResultNotice({ children, action, className, ...props }: ResultNoticeProps) {
  return (
    <div {...props} className={cx(styles.notice, className)} role="status">
      <span className={styles.icon} aria-hidden="true"><Check size={16} strokeWidth={2.2} /></span>
      <div className={styles.message}>{children}</div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
