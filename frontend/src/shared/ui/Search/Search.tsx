import { Search as SearchIcon, X } from "lucide-react";
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

import { Spinner } from "../Spinner/Spinner";
import { cx } from "../cx";
import styles from "./Search.module.css";

export interface SearchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  loading?: boolean;
  shortcut?: string;
}

export const Search = forwardRef<HTMLInputElement, SearchProps>(function Search(
  {
    label,
    value,
    onValueChange,
    onClear,
    loading = false,
    shortcut,
    className,
    disabled,
    ...props
  },
  ref,
) {
  function clear() {
    onValueChange("");
    onClear?.();
  }

  return (
    <div className={cx(styles.search, disabled && styles.disabled, className)} aria-busy={loading || undefined}>
      <span className={styles.leading} aria-hidden="true">
        {loading ? <Spinner size="sm" label="Поиск" /> : <SearchIcon size={16} strokeWidth={1.8} />}
      </span>
      <input
        {...props}
        ref={ref}
        type="search"
        className={styles.input}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value && !disabled ? (
        <button className={styles.clear} type="button" aria-label="Очистить поиск" onClick={clear}>
          <X size={15} strokeWidth={1.8} />
        </button>
      ) : shortcut ? (
        <kbd className={styles.shortcut}>{shortcut}</kbd>
      ) : null}
    </div>
  );
});
