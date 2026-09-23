import { BookOpen, Boxes, ClipboardList, Database, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Plug, ShoppingCart, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { Button, ConfirmModal } from "../shared/ui";
import { LanguageSwitcher } from "../shared/i18n/LanguageSwitcher";
import { useI18n } from "../shared/i18n/I18nContext";
import { useCurrentUser, useLogout } from "../modules/auth";
import styles from "./AppLayout.module.css";
import { FloatingAssistant } from "./FloatingAssistant";
import { MobileNav } from "./MobileNav";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  mobileLabel?: string;
  count?: number;
}

const SIDEBAR_MODE_KEY = "hackalem.sidebar-mode";

function initialSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_MODE_KEY) !== "compact";
  } catch {
    return true;
  }
}

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
            aria-label={item.label}
            title={item.label}
          >
            {item.icon}
            <span>{item.label}</span>
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/" || item.to === "/data"}
            className={({ isActive }) => (isActive ? `${styles.link} ${styles.active}` : styles.link)}
            aria-label={item.label}
            title={item.label}
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
  const { t } = useI18n();
  const work: NavItem[] = [
    { to: "/", label: t("Обзор", "Шолу", "Overview"), icon: <LayoutDashboard size={17} strokeWidth={1.8} /> },
    { to: "/recommendations", label: t("Расчёты", "Есептеулер", "Calculations"), icon: <ClipboardList size={17} strokeWidth={1.8} /> },
    { to: "/orders", label: t("Заказы поставщикам", "Жеткізушілерге тапсырыстар", "Supplier orders"), mobileLabel: t("Заказы", "Тапсырыстар", "Orders"), icon: <ShoppingCart size={17} strokeWidth={1.8} /> },
    { to: "/inventory", label: t("Запасы", "Қорлар", "Inventory"), icon: <Boxes size={17} strokeWidth={1.8} /> },
    { to: "/assistant", label: t("ИИ Помощник", "ЖИ көмекшісі", "AI assistant"), icon: <Sparkles size={17} strokeWidth={1.8} /> },
  ];
  const data: NavItem[] = [
    { to: "/data", label: t("Источники данных", "Дереккөздер", "Data sources"), mobileLabel: t("Данные", "Деректер", "Data"), icon: <Database size={17} strokeWidth={1.8} /> },
    { to: "/data/integrations", label: t("Интеграция с 1С", "1С интеграциясы", "1C integration"), icon: <Plug size={17} strokeWidth={1.8} /> },
    { to: "/data/catalogs", label: t("Справочники", "Анықтамалықтар", "Catalogs"), icon: <BookOpen size={17} strokeWidth={1.8} /> },
  ];
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(initialSidebarOpen);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
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

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_MODE_KEY, sidebarOpen ? "full" : "compact");
    } catch {
      // Меню продолжит работать, даже если браузер запретил хранилище.
    }
  }, [sidebarOpen]);

  return (
    <div className={styles.app}>
      <div className={styles.sidebarSlot} data-collapsed={sidebarOpen ? undefined : ""}>
        <aside className={styles.side}>
          <div className={styles.brand}>
            <img className={styles.mark} src="/icon.svg" alt="" />
            <span className={styles.brandName}>{t("Центр закупок", "Сатып алу орталығы", "Procurement center")}</span>
            <Button
              className={styles.hideMenu}
              variant="ghost"
              size="sm"
              aria-label={sidebarOpen ? t("Свернуть меню", "Мәзірді жинау", "Collapse menu") : t("Развернуть меню", "Мәзірді ашу", "Expand menu")}
              title={sidebarOpen ? t("Свернуть меню", "Мәзірді жинау", "Collapse menu") : t("Развернуть меню", "Мәзірді ашу", "Expand menu")}
              icon={sidebarOpen ? <PanelLeftClose size={18} strokeWidth={1.8} /> : <PanelLeftOpen size={18} strokeWidth={1.8} />}
              onClick={() => setSidebarOpen((open) => !open)}
            />
          </div>

          <div
            className={styles.navigationFrame}
            data-fade-top={navigationHasPrevious ? "" : undefined}
            data-fade-bottom={navigationHasMore ? "" : undefined}
          >
            <nav
              className={styles.navigation}
              aria-label={t("Разделы", "Бөлімдер", "Sections")}
              ref={navigation}
              onScroll={updateNavigationFade}
            >
              <Section title={t("Работа", "Жұмыс", "Work")} items={work} />
              <Section title={t("Данные", "Деректер", "Data")} items={data} />
            </nav>
          </div>

          <LanguageSwitcher className={styles.language} />

          <div className={styles.me}>
            <span className={styles.avatar} aria-hidden="true">
              {user ? initials(user.full_name) : "—"}
            </span>
            <div className={styles.who}>
              <b>{user?.full_name ?? t("Гость", "Қонақ", "Guest")}</b>
              <span>{user?.email ?? ""}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("Выйти", "Шығу", "Sign out")}
              icon={<LogOut size={15} strokeWidth={1.8} />}
              loading={logout.isPending}
              onClick={() => setLogoutConfirmOpen(true)}
            />
          </div>
        </aside>
      </div>

      <main className={styles.main}>
        <Outlet />
      </main>

      <FloatingAssistant />

      <MobileNav
        primary={work.slice(0, 3)}
        rest={[work[3], ...data]}
        userName={user?.full_name ?? t("Гость", "Қонақ", "Guest")}
        userEmail={user?.email ?? ""}
        initials={user ? initials(user.full_name) : "—"}
        onLogout={() => setLogoutConfirmOpen(true)}
        loggingOut={logout.isPending}
      />

      <ConfirmModal
        id="confirm-logout"
        title={t("Выйти из аккаунта?", "Тіркелгіден шығу керек пе?", "Sign out of your account?")}
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        confirmLabel={t("Выйти", "Шығу", "Sign out")}
        cancelLabel={t("Остаться", "Қалу", "Stay")}
        confirmVariant="danger"
        onConfirm={() => logout.mutateAsync().catch(() => undefined)}
      >
        {t("Вы точно хотите выйти? Для продолжения работы понадобится войти снова.", "Шынымен шыққыңыз келе ме? Жұмысты жалғастыру үшін қайта кіру қажет.", "Are you sure you want to sign out? You will need to sign in again to continue.")}
      </ConfirmModal>
    </div>
  );
}
