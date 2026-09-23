import { Check } from "lucide-react";
import type { CSSProperties, HTMLAttributes } from "react";

import { cx } from "../cx";
import styles from "./Progress.module.css";

export type ProgressTone = "accent" | "success" | "warning" | "danger";
export type ProgressVariant = "linear" | "circular";

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: string;
  value?: number;
  description?: string;
  tone?: ProgressTone;
  variant?: ProgressVariant;
  indeterminate?: boolean;
  showValue?: boolean;
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function Progress({
  label,
  value = 0,
  description,
  tone = "accent",
  variant = "linear",
  indeterminate = false,
  showValue = true,
  className,
  ...props
}: ProgressProps) {
  const percent = clamp(value);
  const progressA11y = {
    role: "progressbar",
    "aria-label": label,
    "aria-valuemin": indeterminate ? undefined : 0,
    "aria-valuemax": indeterminate ? undefined : 100,
    "aria-valuenow": indeterminate ? undefined : percent,
    "aria-valuetext": indeterminate ? "Выполняется" : `${percent}%`,
  } as const;

  if (variant === "circular") {
    const radius = 27;
    const circumference = 2 * Math.PI * radius;
    const ringStyle = {
      strokeDasharray: circumference,
      strokeDashoffset: indeterminate ? circumference * 0.72 : circumference * (1 - percent / 100),
    };

    return (
      <div {...props} className={cx(styles.circularRoot, styles[tone], className)}>
        <div {...progressA11y} className={cx(styles.ring, indeterminate && styles.ringIndeterminate)}>
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle className={styles.ringTrack} cx="32" cy="32" r={radius} />
            <circle className={styles.ringValue} cx="32" cy="32" r={radius} style={ringStyle} />
          </svg>
          <span className={styles.ringText}>{indeterminate ? "•••" : `${percent}%`}</span>
        </div>
        <div className={styles.copy}>
          <strong>{label}</strong>
          {description ? <span>{description}</span> : null}
        </div>
      </div>
    );
  }

  const fillStyle = { "--progress-value": `${percent}%` } as CSSProperties;

  return (
    <div {...props} className={cx(styles.linearRoot, styles[tone], className)}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        {showValue ? <span className={styles.value}>{indeterminate ? "Выполняется" : `${percent}%`}</span> : null}
      </div>
      <div {...progressA11y} className={styles.track}>
        <span
          className={cx(styles.fill, indeterminate && styles.indeterminate)}
          style={indeterminate ? undefined : fillStyle}
        />
      </div>
      {description ? <span className={styles.description}>{description}</span> : null}
    </div>
  );
}

export interface ProgressStepsProps extends Omit<HTMLAttributes<HTMLOListElement>, "children"> {
  label: string;
  steps: string[];
  current: number;
  onStepChange?: (step: number) => void;
}

export function ProgressSteps({ label, steps, current, onStepChange, className, style, ...props }: ProgressStepsProps) {
  const activeStep = Math.min(Math.max(current, 0), Math.max(steps.length - 1, 0));
  const stepsStyle = { ...style, "--steps-count": steps.length } as CSSProperties;

  return (
    <ol {...props} className={cx(styles.steps, className)} style={stepsStyle} aria-label={label}>
      {steps.map((step, index) => {
        const completed = index < activeStep;
        const active = index === activeStep;

        return (
          <li key={step} className={cx(styles.step, completed && styles.stepCompleted, active && styles.stepActive)}>
            <button
              type="button"
              className={styles.stepButton}
              aria-current={active ? "step" : undefined}
              onClick={() => onStepChange?.(index)}
              disabled={!onStepChange}
            >
              <span className={styles.stepMarker} aria-hidden="true">
                {completed ? <Check size={13} strokeWidth={2.4} /> : index + 1}
              </span>
              <span className={styles.stepLabel}>{step}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
