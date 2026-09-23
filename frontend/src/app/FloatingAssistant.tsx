import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { AssistantPanel, NovaOrb } from "../modules/assistant";
import { useI18n } from "../shared/i18n/I18nContext";
import styles from "./FloatingAssistant.module.css";

const NUDGE_DISMISSED_KEY = "assistant-nudge-dismissed";

/** Desktop entry point for the same assistant panel formerly opened from the header. */
export function FloatingAssistant() {
  const { t } = useI18n();
  const nudgeMessages = [
    t("Нужна помощь с расчётом?", "Есептеуге көмек керек пе?", "Need help with a calculation?"),
    t("Подсказать, что проверить в заказе?", "Тапсырыста нені тексеру керегін айтайын ба?", "Want to know what to check in an order?"),
    t("Есть вопрос по остаткам?", "Қалдықтар туралы сұрағыңыз бар ма?", "Have a question about stock?"),
  ];
  const panelId = useId();
  const { pathname } = useLocation();
  const onAssistantPage = pathname.replace(/\/$/, "") === "/assistant";
  const [isOpen, setIsOpen] = useState(false);
  const [nudgeIndex, setNudgeIndex] = useState(-1);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(NUDGE_DISMISSED_KEY) === "yes";
    } catch {
      return false;
    }
  });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (onAssistantPage) setIsOpen(false); }, [onAssistantPage]);

  useEffect(() => {
    if (nudgeDismissed || isOpen || pathname === "/assistant") return;
    let nextIndex = 0;
    const showNext = () => {
      setNudgeIndex(nextIndex);
      nextIndex = (nextIndex + 1) % nudgeMessages.length;
    };
    const first = window.setTimeout(showNext, 9000);
    const interval = window.setInterval(showNext, 42000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      setNudgeIndex(-1);
    };
  }, [nudgeDismissed, isOpen, pathname]);

  useEffect(() => {
    if (nudgeIndex < 0) return;
    const timeout = window.setTimeout(() => setNudgeIndex(-1), 6500);
    return () => window.clearTimeout(timeout);
  }, [nudgeIndex]);

  function dismissNudge() {
    setNudgeDismissed(true);
    setNudgeIndex(-1);
    try {
      sessionStorage.setItem(NUDGE_DISMISSED_KEY, "yes");
    } catch {
      // Подсказка всё равно скрывается на время текущей сессии приложения.
    }
  }

  useEffect(() => {
    if (!isOpen || onAssistantPage) return;

    root.current?.querySelector("textarea")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      // A portalled modal owns keyboard input until it closes.
      if (event.defaultPrevented || root.current?.closest("[inert]")) return;
      if (event.key === "Escape") {
        setIsOpen(false);
        trigger.current?.focus();
      }
    };
    const closeOnOutside = (event: MouseEvent) => {
      // Context/history dialogs live outside this root in ModalProvider's portal.
      if (root.current?.closest("[inert]")) return;
      if (!root.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutside);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutside);
    };
  }, [isOpen, onAssistantPage]);

  // The full-page chat already provides the assistant; do not duplicate its launcher.
  if (onAssistantPage) return null;


  return (
    <div className={styles.root} ref={root}>
      <div className={styles.nudge} data-visible={nudgeIndex >= 0 && !isOpen && pathname !== "/assistant" ? "" : undefined} aria-hidden={nudgeIndex < 0 || isOpen || pathname === "/assistant"}>
        {nudgeMessages[Math.max(0, nudgeIndex)]}
      </div>
      <aside
        id={panelId}
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
        role="dialog"
        aria-label={t("ИИ Помощник", "ЖИ көмекшісі", "AI assistant")}
        aria-modal="false"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <header className={styles.header}>
          <div>
            <h2>{t("ИИ Помощник", "ЖИ көмекшісі", "AI assistant")}</h2>
            <p>{t("Помощь по закупкам", "Сатып алу бойынша көмек", "Procurement help")}</p>
          </div>
          <button type="button" className={styles.close} aria-label={t("Закрыть помощника", "Көмекшіні жабу", "Close assistant")} onClick={() => { setIsOpen(false); trigger.current?.focus(); }}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>
        <AssistantPanel onOpenFull={() => setIsOpen(false)} />
      </aside>

      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={isOpen ? t("Закрыть ИИ-помощника", "ЖИ көмекшісін жабу", "Close AI assistant") : t("Открыть ИИ-помощника", "ЖИ көмекшісін ашу", "Open AI assistant")}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => { dismissNudge(); setIsOpen((current) => !current); }}
      >
        <NovaOrb variant="mini" size="calc(var(--touch) + var(--ctl) + var(--sp-4))" />
      </button>
    </div>
  );
}
