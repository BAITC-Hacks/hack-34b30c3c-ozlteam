import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Locale = "ru" | "kk" | "en";

const STORAGE_KEY = "hackalem.locale";

export function translate(locale: Locale, ru: string, kk: string, en: string): string {
  return locale === "kk" ? kk : locale === "en" ? en : ru;
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "kk" || saved === "en") return saved;
  } catch {
    // The interface still works when browser storage is unavailable.
  }
  return "ru";
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (ru: string, kk: string, en: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const t = useCallback((ru: string, kk: string, en: string) => translate(locale, ru, kk, en), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale === "kk" ? "kk-KZ" : locale === "en" ? "en" : "ru";
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Keep the in-memory selection for this session.
    }
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
