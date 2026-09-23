import { forwardRef } from "react";
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cx } from "../cx";
import styles from "./Table.module.css";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Липкая шапка внутри области прокрутки. По умолчанию включена. */
  stickyHeader?: boolean;
  /** Высота области прокрутки, например `"420px"`. Без неё таблица растёт. */
  maxHeight?: string;
  /** Класс на внешней области прокрутки; className уходит на <table>. */
  wrapperClassName?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { stickyHeader = true, maxHeight, className, wrapperClassName, ...rest },
  ref,
) {
  return (
    <div
      className={cx(
        styles.wrap,
        !stickyHeader && styles.notSticky,
        wrapperClassName,
      )}
      style={maxHeight === undefined ? undefined : { maxHeight }}
    >
      <table {...rest} ref={ref} className={cx(styles.table, className)} />
    </div>
  );
});

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Колонка чисел: выравнивание вправо и табличные цифры. */
  numeric?: boolean;
}

export const Th = forwardRef<HTMLTableCellElement, ThProps>(function Th(
  { numeric = false, className, scope = "col", ...rest },
  ref,
) {
  return (
    <th
      {...rest}
      ref={ref}
      scope={scope}
      className={cx(styles.th, numeric && styles.numeric, className)}
    />
  );
});

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Ячейка с числом: выравнивание вправо и табличные цифры. */
  numeric?: boolean;
}

export const Td = forwardRef<HTMLTableCellElement, TdProps>(function Td(
  { numeric = false, className, ...rest },
  ref,
) {
  return (
    <td
      {...rest}
      ref={ref}
      className={cx(styles.td, numeric && styles.numeric, className)}
    />
  );
});

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Строка кликабельна целиком: подсветка --sunken и видимый фокус. */
  interactive?: boolean;
}

export const Tr = forwardRef<HTMLTableRowElement, TrProps>(function Tr(
  { interactive = false, className, ...rest },
  ref,
) {
  return (
    <tr
      {...rest}
      ref={ref}
      className={cx(styles.tr, interactive && styles.interactive, className)}
    />
  );
});
