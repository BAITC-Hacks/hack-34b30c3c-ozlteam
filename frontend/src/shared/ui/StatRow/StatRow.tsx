import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./StatRow.module.css";

export type StatDeltaTone = "good" | "warn" | "bad" | "neutral";

export interface Stat {
  /** Короткая подпись над числом. */
  label: ReactNode;
  /** Само число. Крупное, табличными цифрами. */
  value: ReactNode;
  /** Мелкий хвост после числа: «/100», «из 142». */
  unit?: ReactNode;
  /** Иконка в подложке слева, lucide-react, штрих 1.8. */
  icon?: ReactNode;
  /** Изменение или пометка справа: «+31 %», «4 заявки». */
  delta?: ReactNode;
  /** Смысл изменения. Цвет несёт значение, а не украшает. */
  deltaTone?: StatDeltaTone;
}

export interface StatRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Обычно от трёх до пяти: дальше числа перестают читаться одним взглядом. */
  items: Stat[];
}

/**
 * Ряд ключевых чисел одной карточкой с разделителями — плотнее, чем отдельные
 * плитки, и читается как одна строка состояния. Для одиночного числа берите `Tile`.
 */
export function StatRow({ items, className, ...rest }: StatRowProps) {
  return (
    <div {...rest} className={cx(styles.row, className)}>
      {items.map((item, index) => (
        <div className={styles.cell} key={index}>
          {item.icon !== undefined ? (
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
          ) : null}
          <div className={styles.body}>
            <span className={styles.label}>{item.label}</span>
            <div className={styles.line}>
              <strong className={styles.value}>{item.value}</strong>
              {item.unit !== undefined ? <span className={styles.unit}>{item.unit}</span> : null}
              {item.delta !== undefined ? (
                <span className={cx(styles.delta, styles[item.deltaTone ?? "neutral"])}>
                  {item.delta}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
