import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "../Spinner/Spinner";
import { cx } from "../cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "dark" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary — действие, secondary — альтернатива, dark — главное действие раздела,
   *  ghost — тихое, danger — разрушающее. */
  variant?: ButtonVariant;
  /** md — 36 px, sm — 30 px. */
  size?: ButtonSize;
  /** Спиннер вместо текста; кнопка недоступна, ширина сохраняется. */
  loading?: boolean;
  /** Иконка перед текстом (lucide-react, штрих 1.8). */
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      disabled,
      type = "button",
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        disabled={disabled === true || loading}
        aria-busy={loading || undefined}
        className={cx(
          styles.btn,
          styles[variant],
          size === "sm" && styles.sm,
          loading && styles.isLoading,
          className,
        )}
      >
        <span className={styles.label}>
          {icon ? (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {children}
        </span>
        {loading ? (
          <span className={styles.spinner}>
            <Spinner size={size === "sm" ? "sm" : "md"} label="Выполняется" />
          </span>
        ) : null}
      </button>
    );
  },
);
