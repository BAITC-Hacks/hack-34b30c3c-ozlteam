import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Field.module.css";

export interface FieldCounter {
  value: number;
  max: number;
}

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  /** Подпись поля, 13/600. Обязательна: поле без подписи не сдаётся. */
  label: ReactNode;
  /** Текст ошибки. Заменяет подсказку и включает красное кольцо. */
  error?: ReactNode;
  /** Подсказка под полем, 12 px --mut. */
  hint?: ReactNode;
  /** Счётчик символов `n / max` справа от подписи. */
  counter?: FieldCounter;
  /** Класс на обёртке; className уходит на сам input. */
  wrapperClassName?: string;
}

/** Доля лимита, начиная с которой счётчик предупреждает. */
const NEAR_LIMIT_RATIO = 0.9;

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, counter, className, wrapperClassName, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `field-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const hasError = error !== undefined && error !== null && error !== false;
  const showHint = !hasError && hint !== undefined;

  const over = counter !== undefined && counter.value > counter.max;
  const near =
    counter !== undefined &&
    !over &&
    counter.max > 0 &&
    counter.value >= counter.max * NEAR_LIMIT_RATIO;

  const describedBy =
    cx(
      hasError ? errorId : undefined,
      showHint ? hintId : undefined,
      rest["aria-describedby"],
    ) || undefined;

  return (
    <div className={cx(styles.field, hasError && styles.hasError, wrapperClassName)}>
      <div className={styles.top}>
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
        {counter !== undefined ? (
          <span
            className={cx(
              styles.counter,
              near && styles.counterNear,
              over && styles.counterOver,
            )}
          >
            {counter.value} / {counter.max}
          </span>
        ) : null}
      </div>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        className={cx(styles.input, className)}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
      />
      {hasError ? (
        <div className={styles.error} id={errorId}>
          {error}
        </div>
      ) : null}
      {showHint ? (
        <div className={styles.hint} id={hintId}>
          {hint}
        </div>
      ) : null}
    </div>
  );
});
