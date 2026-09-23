import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { cx } from "../cx";
import styles from "./Tabs.module.css";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

function formatCount(count: number) {
  return count >= 1_000 ? `${Math.floor(count / 1_000)}K` : count;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function Tabs({ items, value, onValueChange, ariaLabel, className }: TabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = tabsRef.current;
    if (!element) return;
    setCanScrollBack(element.scrollLeft > 1);
    setCanScrollForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }, []);

  useLayoutEffect(() => {
    const element = tabsRef.current;
    if (!element) return;
    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items, updateScrollState]);

  function scrollTabs(direction: -1 | 1) {
    const element = tabsRef.current;
    if (!element) return;
    const maximum = Math.max(0, element.scrollWidth - element.clientWidth);
    const distance = Math.max(160, element.clientWidth * 0.7);
    const target = Math.min(maximum, Math.max(0, element.scrollLeft + direction * distance));
    element.scrollTo({ left: target, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = items.length - 1;
    const target = event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : event.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : (index + 1) % items.length;
    const item = items[target];
    if (!item) return;
    onValueChange(item.id);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[target]?.focus();
  }

  return (
    <div
      className={cx(
        styles.shell,
        canScrollBack && styles.canScrollBack,
        canScrollForward && styles.canScrollForward,
        className,
      )}
    >
      <button
        type="button"
        className={cx(styles.scrollButton, styles.back, canScrollBack && styles.available)}
        disabled={!canScrollBack}
        aria-label="Показать предыдущие вкладки"
        onClick={() => scrollTabs(-1)}
      >
        <ChevronLeft size={14} strokeWidth={1.8} />
      </button>
      <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label={ariaLabel} onScroll={updateScrollState}>
        {items.map((item, index) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={cx(styles.item, active && styles.active)}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onValueChange(item.id)}
              onKeyDown={(event) => moveTab(event, index)}
            >
              <span
                className={styles.label}
                data-label={item.label}
              >
                <span>{item.label}</span>
              </span>
              {item.count !== undefined ? <span className={styles.count}>{formatCount(item.count)}</span> : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={cx(styles.scrollButton, styles.forward, canScrollForward && styles.available)}
        disabled={!canScrollForward}
        aria-label="Показать следующие вкладки"
        onClick={() => scrollTabs(1)}
      >
        <ChevronRight size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}
