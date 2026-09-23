import { LogOut, Menu, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { Button } from "../shared/ui";
import styles from "./MobileNav.module.css";

export interface MobileNavItem {
  to: string;
  label: string;
  icon: ReactNode;
  mobileLabel?: string;
  disabled?: boolean;
}

interface Props {
  /** Три рабочих раздела вокруг центрального действия ассистента. */
  primary: MobileNavItem[];
  /** Остальные разделы, они живут в листе «Ещё». */
  rest: MobileNavItem[];
  userName: string;
  userEmail: string;
  initials: string;
  onLogout: () => void;
  loggingOut: boolean;
}

export function MobileNav({
  primary,
  rest,
  userName,
  userEmail,
  initials,
  onLogout,
  loggingOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const sheet = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);

  // Раздел из листа активен — подсвечиваем «Ещё», иначе переход выглядит как промах.
  const availableRest = rest.filter((item) => !item.disabled);
  const disabledRest = rest.filter((item) => item.disabled);
  const restIsActive = availableRest.some((item) => location.pathname === item.to);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Фокус уезжает в лист, а по закрытию возвращается на кнопку, которая его открыла.
    sheet.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      moreButton.current?.focus();
    };
  }, [open]);

  return (
    <>
      <div
        className={styles.scrim}
        data-open={open ? "" : undefined}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        className={styles.sheet}
        data-open={open ? "" : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Ещё разделы"
        aria-hidden={open ? undefined : "true"}
        ref={sheet}
      >
        <div className={styles.grab} aria-hidden="true" />
        <nav className={styles.sheetNav} aria-label="Остальные разделы">
          {availableRest.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/data"}
              className={({ isActive }) =>
                isActive ? `${styles.sheetLink} ${styles.activeLink}` : styles.sheetLink
              }
              tabIndex={open ? undefined : -1}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
          {disabledRest.length > 0 ? <div className={styles.disabledGroup}>Недоступно</div> : null}
          {disabledRest.map((item) => (
            <span
              key={item.to}
              className={`${styles.sheetLink} ${styles.disabledLink}`}
              role="link"
              aria-disabled="true"
            >
              {item.icon}
              <span>{item.label}</span>
            </span>
          ))}
        </nav>

        <div className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {initials}
          </span>
          <div className={styles.who}>
            <b>{userName}</b>
            <span>{userEmail}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut size={15} strokeWidth={1.8} />}
            loading={loggingOut}
            onClick={onLogout}
            tabIndex={open ? undefined : -1}
          >
            Выйти
          </Button>
        </div>
      </div>

      <nav className={styles.bar} aria-label="Основные разделы">
        {primary.slice(0, 2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              isActive ? `${styles.cell} ${styles.activeCell}` : styles.cell
            }
          >
            {item.icon}
            <span>{item.mobileLabel ?? item.label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/assistant"
          className={({ isActive }) =>
            isActive ? `${styles.cell} ${styles.assistantCell} ${styles.activeAssistantCell}` : `${styles.cell} ${styles.assistantCell}`
          }
          aria-label="Нова — ИИ-помощник по закупкам"
        >
          <span className={styles.assistantOrb} aria-hidden="true">
            <span className={`${styles.assistantOrbit} ${styles.assistantOrbitOne}`} />
            <span className={`${styles.assistantOrbit} ${styles.assistantOrbitTwo}`} />
            <span className={styles.assistantSphere} />
            <span className={styles.assistantCore}>
              <Sparkles size={23} strokeWidth={1.8} />
            </span>
          </span>
          <span className={styles.assistantLabel}>Нова</span>
        </NavLink>
        {primary.slice(2).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? `${styles.cell} ${styles.activeCell}` : styles.cell
            }
          >
            {item.icon}
            <span>{item.mobileLabel ?? item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          ref={moreButton}
          className={restIsActive || open ? `${styles.cell} ${styles.activeCell}` : styles.cell}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} strokeWidth={1.8} /> : <Menu size={20} strokeWidth={1.8} />}
          <span>Ещё</span>
        </button>
      </nav>
    </>
  );
}
