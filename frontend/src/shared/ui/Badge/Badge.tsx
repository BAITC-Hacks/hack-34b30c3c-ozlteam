import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Badge.module.css";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Смысл статуса. Цвет несёт значение, а не украшает. */
  tone: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} {...rest}>
      {children}
    </span>
  );
}
