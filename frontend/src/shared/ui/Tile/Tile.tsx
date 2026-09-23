import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Tile.module.css";

export type TileTone = "default" | "up" | "good" | "warn";

export interface TileProps extends HTMLAttributes<HTMLDivElement> {
  /** Подпись над цифрой, 12,5 px --mut. */
  label: ReactNode;
  /** Крупная цифра, 26/600, табличные цифры. */
  value: ReactNode;
  /** Пояснение под цифрой, 12 px. Цвет зависит от tone. */
  hint?: ReactNode;
  /** Смысл значения: up — рост, который тревожит; good — норма; warn — риск. */
  tone?: TileTone;
  /** Полоса заполнения, 0..100. Значения вне диапазона обрезаются. */
  progress?: number;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export const Tile = forwardRef<HTMLDivElement, TileProps>(function Tile(
  { label, value, hint, tone = "default", progress, className, ...rest },
  ref,
) {
  const percent = progress === undefined ? undefined : clampPercent(progress);

  return (
    <div
      {...rest}
      ref={ref}
      className={cx(styles.tile, tone !== "default" && styles[tone], className)}
    >
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
      {hint !== undefined ? <div className={styles.hint}>{hint}</div> : null}
      {percent !== undefined ? (
        <div
          className={styles.meter}
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className={styles.meterFill} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
});
