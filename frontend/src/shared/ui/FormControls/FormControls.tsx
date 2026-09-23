import { forwardRef, useId } from "react";
import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cx } from "../cx";
import styles from "./FormControls.module.css";

interface ControlMetaProps {
  label: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">,
    ControlMetaProps {
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, children, className, wrapperClassName, id, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? `select-${generatedId}`;
  const messageId = `${controlId}-${error ? "error" : "hint"}`;

  return (
    <label className={cx(styles.control, Boolean(error) && styles.hasError, wrapperClassName)} htmlFor={controlId}>
      <span className={styles.label}>{label}</span>
      <span className={styles.selectWrap}>
        <select
          {...props}
          ref={ref}
          id={controlId}
          className={cx(styles.input, styles.select, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : props["aria-describedby"]}
        >
          {children}
        </select>
        <span className={styles.chevron} aria-hidden="true" />
      </span>
      {error ? <span className={styles.error} id={messageId}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint} id={messageId}>{hint}</span> : null}
    </label>
  );
});

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children">,
    ControlMetaProps {
  counter?: { value: number; max: number };
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, counter, className, wrapperClassName, id, ...props },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? `textarea-${generatedId}`;
  const messageId = `${controlId}-${error ? "error" : "hint"}`;
  const overLimit = counter !== undefined && counter.value > counter.max;

  return (
    <label className={cx(styles.control, Boolean(error) && styles.hasError, wrapperClassName)} htmlFor={controlId}>
      <span className={styles.top}>
        <span className={styles.label}>{label}</span>
        {counter ? (
          <span className={cx(styles.counter, overLimit && styles.counterOver)}>
            {counter.value} / {counter.max}
          </span>
        ) : null}
      </span>
      <textarea
        {...props}
        ref={ref}
        id={controlId}
        className={cx(styles.input, styles.textarea, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : props["aria-describedby"]}
      />
      {error ? <span className={styles.error} id={messageId}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint} id={messageId}>{hint}</span> : null}
    </label>
  );
});
