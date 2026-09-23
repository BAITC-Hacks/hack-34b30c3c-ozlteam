import { Check } from "lucide-react";
import { useId, useRef } from "react";
import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Controls.module.css";

interface ChoiceCopyProps {
  label: ReactNode;
  description?: ReactNode;
}

function ChoiceCopy({ label, description }: ChoiceCopyProps) {
  return (
    <span className={styles.copy}>
      <span className={styles.label}>{label}</span>
      {description ? <span className={styles.description}>{description}</span> : null}
    </span>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, disabled, ...props }: CheckboxProps) {
  return (
    <label className={cx(styles.choice, disabled && styles.disabled, className)}>
      <input {...props} className={styles.native} type="checkbox" disabled={disabled} />
      <span className={styles.checkbox} aria-hidden="true">
        <Check size={13} strokeWidth={2.4} />
      </span>
      <ChoiceCopy label={label} description={description} />
    </label>
  );
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> {
  label: ReactNode;
  description?: ReactNode;
}

export function Switch({ label, description, className, disabled, ...props }: SwitchProps) {
  return (
    <label className={cx(styles.choice, disabled && styles.disabled, className)}>
      <input {...props} className={styles.native} type="checkbox" role="switch" disabled={disabled} />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <ChoiceCopy label={label} description={description} />
    </label>
  );
}

export interface RadioItem {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: ReactNode;
  items: RadioItem[];
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function RadioGroup({
  label,
  items,
  value,
  onValueChange,
  name,
  disabled = false,
  className,
}: RadioGroupProps) {
  const generatedName = `radio-${useId().replaceAll(":", "")}`;

  return (
    <fieldset className={cx(styles.radioGroup, className)} disabled={disabled}>
      <legend>{label}</legend>
      <div className={styles.radioList}>
        {items.map((item) => (
          <label key={item.value} className={cx(styles.choice, (disabled || item.disabled) && styles.disabled)}>
            <input
              className={styles.native}
              type="radio"
              name={name ?? generatedName}
              value={item.value}
              checked={item.value === value}
              disabled={item.disabled}
              onChange={() => onValueChange(item.value)}
            />
            <span className={styles.radio} aria-hidden="true" />
            <ChoiceCopy label={item.label} description={item.description} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface SegmentedItem {
  value: string;
  label: string;
  /** Размер набора за этим сегментом: сколько записей в него попадает. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedProps {
  items: SegmentedItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

export function Segmented({ items, value, onValueChange, ariaLabel, className }: SegmentedProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = items.map((item, itemIndex) => ({ item, itemIndex })).filter(({ item }) => !item.disabled);
    const current = enabled.findIndex(({ itemIndex }) => itemIndex === index);
    const target = event.key === "Home"
      ? enabled[0]
      : event.key === "End"
        ? enabled.at(-1)
        : enabled[(current + (event.key === "ArrowLeft" ? -1 : 1) + enabled.length) % enabled.length];
    if (!target) return;
    onValueChange(target.item.value);
    rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[target.itemIndex]?.focus();
  }

  return (
    <div ref={rootRef} className={cx(styles.segmented, className)} role="radiogroup" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            className={cx(styles.segment, active && styles.segmentActive)}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={styles.segmentCount}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
