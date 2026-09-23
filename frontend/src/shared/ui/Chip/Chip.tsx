import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Chip.module.css";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed?: boolean;
  count?: ReactNode;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { pressed = false, count, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cx(styles.chip, pressed && styles.pressed, className)}
      aria-pressed={pressed}
    >
      <span>{children}</span>
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </button>
  );
});
