import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Breakdown.module.css";

export type SegmentTone = "accent" | "good" | "warn" | "bad" | "muted";

export interface Segment {
  /** Название доли: «Оплачено в срок», «Просрочено больше 90 дней». */
  label: ReactNode;
  /** Вес доли в любых единицах: проценты считаются от суммы весов. */
  value: number;
  /** Что показать в легенде вместо доли: сумма, количество. */
  display?: ReactNode;
  /** Человеческое пояснение под значением: «ещё не тревожно», «пора звонить». */
  note?: ReactNode;
  tone?: SegmentTone;
}

export interface BreakdownProps extends HTMLAttributes<HTMLDivElement> {
  segments: Segment[];
  /** Чем является целое: подписывает 100 % для читателя с экранным диктором. */
  totalLabel?: string;
}

/**
 * Разбивка целого на доли: одна полоса сегментами и легенда под ней.
 * Для одного значения из ста берите `progress` у `Tile`.
 */
export function Breakdown({ segments, totalLabel, className, ...rest }: BreakdownProps) {
  const total = segments.reduce((sum, item) => sum + Math.max(0, item.value), 0);

  return (
    <div {...rest} className={cx(styles.breakdown, className)}>
      <div
        className={styles.bar}
        role="img"
        aria-label={
          totalLabel === undefined ? undefined : `${totalLabel}: ${segments.length} долей`
        }
      >
        {total > 0
          ? segments.map((item, index) => (
              <span
                key={index}
                className={cx(styles.segment, styles[item.tone ?? "accent"])}
                style={{ width: `${(Math.max(0, item.value) / total) * 100}%` }}
              />
            ))
          : null}
      </div>

      <dl className={styles.legend}>
        {segments.map((item, index) => (
          <div className={styles.item} key={index}>
            <dt className={styles.name}>
              <i className={cx(styles.dot, styles[item.tone ?? "accent"])} aria-hidden="true" />
              {item.label}
            </dt>
            <dd className={styles.figure}>
              {item.display ?? item.value}
              {item.note !== undefined ? <span className={styles.note}>{item.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
