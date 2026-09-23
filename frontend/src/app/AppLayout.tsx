import { BookOpen, Boxes, ClipboardList, Container, Database, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { Button } from "../shared/ui";
import { useCurrentUser, useLogout } from "../modules/auth";
import styles from "./AppLayout.module.css";
import { MobileNav } from "./MobileNav";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  mobileLabel?: string;
  count?: number;
}

const WORK: NavItem[] = [
  { to: "/", label: "Обзор", icon: <LayoutDashboard size={17} strokeWidth={1.8} /> },
  { to: "/recommendations", label: "Расчёты", icon: <ClipboardList size={17} strokeWidth={1.8} /> },
  { to: "/orders", label: "Заказы поставщикам", mobileLabel: "Заказы", icon: <ShoppingCart size={17} strokeWidth={1.8} /> },
  { to: "/inventory", label: "Запасы", icon: <Boxes size={17} strokeWidth={1.8} /> },
];

const DATA: NavItem[] = [
  { to: "/data", label: "Источники данных", mobileLabel: "Данные", icon: <Database size={17} strokeWidth={1.8} /> },
  { to: "/data/catalogs", label: "Справочники", icon: <BookOpen size={17} strokeWidth={1.8} /> },
];

const MOBILE_PRIMARY = WORK;
const MOBILE_REST = DATA;

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Section({
  title,
  items,
  disabled = false,
}: {
  title: string;
  items: NavItem[];
  disabled?: boolean;
}) {
  return (
    <section className={styles.navSection} aria-label={title}>
      <div className={styles.group}>{title}</div>
      {items.map((item) =>
        disabled ? (
          <span
            key={item.to}
            className={`${styles.link} ${styles.disabled}`}
            role="link"
            aria-disabled="true"
          >
            {item.icon}
            <span>{item.label}</span>
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.count !== undefined ? <b className={styles.count}>{item.count}</b> : null}
          </NavLink>
        ),
      )}
    </section>
  );
}

export function AppLayout() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigation = useRef<HTMLElement>(null);
  const [navigationHasPrevious, setNavigationHasPrevious] = useState(false);
  const [navigationHasMore, setNavigationHasMore] = useState(false);

  const updateNavigationFade = useCallback(() => {
    const element = navigation.current;
    if (!element) return;
    setNavigationHasPrevious(element.scrollTop > 1);
    setNavigationHasMore(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
  }, []);

  useEffect(() => {
    updateNavigationFade();
    const observer = new ResizeObserver(updateNavigationFade);
    if (navigation.current) observer.observe(navigation.current);
    return () => observer.disconnect();
  }, [sidebarOpen, updateNavigationFade]);

  return (
    <div className={styles.app}>
      <div className={styles.sidebarSlot} data-hidden={sidebarOpen ? undefined : ""}>
        <aside className={styles.side} aria-hidden={sidebarOpen ? undefined : true}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">
              <Container size={19} strokeWidth={1.8} />
            </span>
            <span>Поток ИИ</span>
            <Button
              className={styles.hideMenu}
              variant="ghost"
              size="sm"
              aria-label="Скрыть меню"
              icon={<PanelLeftClose size={15} strokeWidth={1.8} />}
              onClick={() => setSidebarOpen(false)}
            />
          </div>

          <div
            className={styles.navigationFrame}
            data-fade-top={navigationHasPrevious ? "" : undefined}
            data-fade-bottom={navigationHasMore ? "" : undefined}
          >
            <nav
              className={styles.navigation}
              aria-label="Разделы"
              ref={navigation}
              onScroll={updateNavigationFade}
            >
              <Section title="Работа" items={WORK} />
              <Section title="Данные" items={DATA} />
            </nav>
          </div>

          <div className={styles.me}>
            <span className={styles.avatar} aria-hidden="true">
              {user ? initials(user.full_name) : "—"}
            </span>
            <div className={styles.who}>
              <b>{user?.full_name ?? "Гость"}</b>
              <span>{user?.email ?? ""}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Выйти"
              icon={<LogOut size={15} strokeWidth={1.8} />}
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            />
          </div>
        </aside>
      </div>

      <Button
        className={styles.showMenu}
        variant="secondary"
        aria-label="Показать меню"
        aria-hidden={sidebarOpen ? true : undefined}
        tabIndex={sidebarOpen ? -1 : undefined}
        data-visible={sidebarOpen ? undefined : ""}
        icon={<PanelLeftOpen size={17} strokeWidth={1.8} />}
        onClick={() => setSidebarOpen(true)}
      />

      <main className={`${styles.main} ${sidebarOpen ? "" : styles.sidebarHidden}`}>
        <Outlet />
      </main>

      <MobileNav
        primary={MOBILE_PRIMARY}
        rest={MOBILE_REST}
        userName={user?.full_name ?? "Гость"}
        userEmail={user?.email ?? ""}
        initials={user ? initials(user.full_name) : "—"}
        onLogout={() => logout.mutate()}
        loggingOut={logout.isPending}
      />
    </div>
  );
}
