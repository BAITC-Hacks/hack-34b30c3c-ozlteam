import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "../cx";
import styles from "./Breadcrumbs.module.css";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: ReactNode;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Максимальное число видимых позиций, включая многоточие. */
  maxItems?: number;
  ariaLabel?: string;
  className?: string;
}

type VisibleItem =
  | { type: "item"; item: BreadcrumbItem; originalIndex: number }
  | { type: "ellipsis" };

function getVisibleItems(items: BreadcrumbItem[], maxItems: number): VisibleItem[] {
  const safeMaxItems = Math.max(3, Math.floor(maxItems));

  if (items.length <= safeMaxItems) {
    return items.map((item, originalIndex) => ({ type: "item", item, originalIndex }));
  }

  const tailStart = items.length - (safeMaxItems - 2);

  return [
    { type: "item", item: items[0], originalIndex: 0 },
    { type: "ellipsis" },
    ...items.slice(tailStart).map((item, offset) => ({
      type: "item" as const,
      item,
      originalIndex: tailStart + offset,
    })),
  ];
}

export function Breadcrumbs({
  items,
  maxItems = 5,
  ariaLabel = "Хлебные крошки",
  className,
}: BreadcrumbsProps) {
  const visibleItems = getVisibleItems(items, maxItems);

  if (items.length === 0) return null;

  return (
    <nav className={cx(styles.breadcrumbs, className)} aria-label={ariaLabel}>
      <ol className={styles.list}>
        {visibleItems.map((visibleItem, visibleIndex) => {
          const showSeparator = visibleIndex < visibleItems.length - 1;

          if (visibleItem.type === "ellipsis") {
            return (
              <li key="ellipsis" className={styles.item} aria-hidden="true">
                <span className={styles.ellipsis}>…</span>
                {showSeparator ? (
                  <ChevronRight className={styles.separator} size={15} strokeWidth={1.8} />
                ) : null}
              </li>
            );
          }

          const { item, originalIndex } = visibleItem;
          const isCurrent = originalIndex === items.length - 1;
          const content = (
            <>
              {item.icon ? <span className={styles.icon} aria-hidden="true">{item.icon}</span> : null}
              <span className={styles.label}>{item.label}</span>
            </>
          );

          return (
            <li key={`${item.href ?? "item"}-${originalIndex}`} className={styles.item}>
              {item.href ? (
                <a
                  className={cx(styles.crumb, styles.link, isCurrent && styles.current)}
                  href={item.href}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {content}
                </a>
              ) : (
                <span
                  className={cx(styles.crumb, isCurrent && styles.current)}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {content}
                </span>
              )}
              {showSeparator ? (
                <ChevronRight
                  className={styles.separator}
                  size={15}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
