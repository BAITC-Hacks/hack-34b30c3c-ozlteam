import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Spinner.module.css";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Диаметр: 13 / 15 / 22 px. По умолчанию `md`. */
  size?: SpinnerSize;
  /** Подпись для скринридера. Пустая строка делает спиннер декоративным. */
  label?: string;
}

export function Spinner({
  size = "md",
  label = "Загрузка",
  className,
  ...rest
}: SpinnerProps) {
  return (
    <span
      className={cx(styles.spinner, styles[size], className)}
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      {...rest}
    />
  );
}
