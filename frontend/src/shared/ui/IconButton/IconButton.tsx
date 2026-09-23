import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Spinner } from "../Spinner/Spinner";
import { cx } from "../cx";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  indicator?: boolean;
  loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, indicator = false, loading = false, disabled, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cx(styles.button, className)}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      title={label}
    >
      <span className={styles.icon} aria-hidden="true">
        {loading ? <Spinner size="sm" label={label} /> : icon}
      </span>
      {indicator ? <span className={styles.indicator} aria-hidden="true" /> : null}
    </button>
  );
});
