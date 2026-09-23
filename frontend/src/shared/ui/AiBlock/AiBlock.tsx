import { useId, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "../Button/Button";
import { cx } from "../cx";
import styles from "./AiBlock.module.css";

export interface AiBlockProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Вывод модели одной фразой. */
  title: ReactNode;
  /** Пояснение: что происходит и что предлагается. */
  text: ReactNode;
  /** Уверенность в процентах, 0..100. Ниже 70 полоса предупреждающая. */
  confidence?: number;
  /** Ряд действий. Всё, что меняет данные, идёт через предпросмотр. */
  actions?: ReactNode;
  /** Источники вывода. Раскрываются кнопкой «Почему», не при наведении. */
  why?: ReactNode;
  /** Подпись кнопки раскрытия. */
  whyLabel?: string;
}

/** Порог, ниже которого рекомендация подаётся осторожнее. */
const LOW_CONFIDENCE = 70;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function AiBlock({
  title,
  text,
  confidence,
  actions,
  why,
  whyLabel = "Почему",
  className,
  ...rest
}: AiBlockProps) {
  const [open, setOpen] = useState(false);
  const reactId = useId();
  const whyId = `ai-why-${reactId}`;

  const percent = confidence === undefined ? undefined : clampPercent(confidence);
  const low = percent !== undefined && percent < LOW_CONFIDENCE;

  return (
    <div
      {...rest}
      className={cx(styles.block, low && styles.low, className)}
    >
      <span className={styles.icon} aria-hidden="true">
        <Sparkles size={16} strokeWidth={1.8} />
      </span>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.text}>{text}</p>
        {actions !== undefined || why !== undefined || percent !== undefined ? (
          <div className={styles.actions}>
            {actions}
            {why !== undefined ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={open}
                aria-controls={whyId}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? "Скрыть" : whyLabel}
              </Button>
            ) : null}
            {percent !== undefined ? (
              <span
                className={styles.confidence}
                role="meter"
                aria-label="Уверенность модели"
                aria-valuenow={Math.round(percent)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                уверенность {Math.round(percent)}%
                <span className={styles.confidenceTrack} aria-hidden="true">
                  <span
                    className={styles.confidenceFill}
                    style={{ width: `${percent}%` }}
                  />
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {why !== undefined ? (
        <div className={styles.why} id={whyId} hidden={!open}>
          {why}
        </div>
      ) : null}
    </div>
  );
}
