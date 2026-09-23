import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Slider.module.css";

export type SliderTone = "accent" | "success" | "warning" | "danger";

interface SliderCopyProps {
  id: string;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}

function SliderCopy({ id, label, value, hint }: SliderCopyProps) {
  return (
    <>
      <div className={styles.header}>
        <span className={styles.label} id={id}>{label}</span>
        <span className={styles.value}>{value}</span>
      </div>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </>
  );
}

export interface SliderProps {
  label: ReactNode;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tone?: SliderTone;
  hint?: ReactNode;
  disabled?: boolean;
  formatValue?: (value: number) => ReactNode;
  className?: string;
}

function percent(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  tone = "accent",
  hint,
  disabled = false,
  formatValue = (current) => current,
  className,
}: SliderProps) {
  const id = useId();
  const fillStyle = { "--slider-start": "0%", "--slider-end": `${percent(value, min, max)}%` } as CSSProperties;

  return (
    <div className={cx(styles.root, styles[tone], disabled && styles.disabled, className)}>
      <SliderCopy id={id} label={label} value={formatValue(value)} hint={hint} />
      <div className={styles.control} style={fillStyle}>
        <span className={styles.track} aria-hidden="true"><span className={styles.fill} /></span>
        <input
          className={styles.input}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-labelledby={id}
          onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
        />
      </div>
    </div>
  );
}

export interface RangeSliderProps {
  label: ReactNode;
  value: readonly [number, number];
  onValueChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  minGap?: number;
  tone?: SliderTone;
  hint?: ReactNode;
  disabled?: boolean;
  formatValue?: (value: readonly [number, number]) => ReactNode;
  className?: string;
}

export function RangeSlider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  minGap = step,
  tone = "accent",
  hint,
  disabled = false,
  formatValue = ([from, to]) => `${from}–${to}`,
  className,
}: RangeSliderProps) {
  const id = useId();
  const [from, to] = value;
  const fillStyle = {
    "--slider-start": `${percent(from, min, max)}%`,
    "--slider-end": `${percent(to, min, max)}%`,
  } as CSSProperties;

  return (
    <div className={cx(styles.root, styles[tone], disabled && styles.disabled, className)}>
      <SliderCopy id={id} label={label} value={formatValue(value)} hint={hint} />
      <div className={styles.control} style={fillStyle}>
        <span className={styles.track} aria-hidden="true"><span className={styles.fill} /></span>
        <input
          className={cx(styles.input, styles.rangeInput)}
          type="range"
          min={min}
          max={max}
          step={step}
          value={from}
          disabled={disabled}
          aria-label={`${String(label)}: от`}
          onChange={(event) => onValueChange([Math.min(event.currentTarget.valueAsNumber, to - minGap), to])}
        />
        <input
          className={cx(styles.input, styles.rangeInput)}
          type="range"
          min={min}
          max={max}
          step={step}
          value={to}
          disabled={disabled}
          aria-label={`${String(label)}: до`}
          onChange={(event) => onValueChange([from, Math.max(event.currentTarget.valueAsNumber, from + minGap)])}
        />
      </div>
    </div>
  );
}
