import { CheckCircle2, Circle } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import { cx } from "../cx";
import { Spinner } from "../Spinner/Spinner";
import styles from "./ThinkingSteps.module.css";

export type ThinkingStepStatus = "complete" | "active" | "pending";

export interface ThinkingStep {
  label: ReactNode;
  status: ThinkingStepStatus;
}

export interface ThinkingStepsProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  steps: ThinkingStep[];
  compact?: boolean;
}

const statusLabels: Record<ThinkingStepStatus, string> = {
  complete: "Готово",
  active: "Выполняется",
  pending: "Ожидает",
};

function StepIcon({ status }: { status: ThinkingStepStatus }) {
  if (status === "complete") {
    return <CheckCircle2 size={17} strokeWidth={2} aria-hidden="true" />;
  }

  if (status === "active") {
    return <Spinner size="sm" label="" />;
  }

  return <Circle size={15} strokeWidth={1.8} aria-hidden="true" />;
}

export function ThinkingSteps({
  title,
  steps,
  compact = false,
  className,
  ...props
}: ThinkingStepsProps) {
  const titleId = useId();
  const isActive = steps.some((step) => step.status === "active");

  return (
    <section
      {...props}
      className={cx(styles.root, compact && styles.compact, className)}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Шаги работы ИИ"}
      aria-live="polite"
      aria-atomic="false"
      aria-busy={isActive}
    >
      {title ? <div id={titleId} className={styles.title}>{title}</div> : null}
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li
            key={index}
            className={cx(styles.step, styles[step.status])}
            aria-current={step.status === "active" ? "step" : undefined}
          >
            <span className={styles.icon} aria-hidden="true">
              <StepIcon status={step.status} />
            </span>
            <span className={styles.label}>{step.label}</span>
            <span className={styles.srOnly}>{statusLabels[step.status]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
