"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { baseDictionaries, mergeDictionaries } from "./dictionaries";
import { format } from "./format";
import { writeLocaleCookie } from "./cookie";
import {
  DEFAULT_LOCALE,
  toBaseLanguage,
  type Dict,
  type Dictionaries,
  type Locale,
} from "./types";

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>
) => string;

export type I18nContextValue = {
  /** Currently selected locale including regional variant, e.g. `nl-BE`. */
  locale: Locale;
  /** Update locale (persists cookie, triggers re-render). */
  setLocale: (next: Locale) => void;
  /** Translate a key using the current dictionary, falling back to English. */
  t: TranslateFn;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export type I18nProviderProps = {
  /** Initial locale resolved server-side (cookie / header / default). */
  initialLocale?: Locale;
  /** Optional per-app dictionary overrides, merged on top of base dictionaries. */
  dictionaries?: Dictionaries;
  children: ReactNode;
};

/**
 * Root provider for the shared i18n system. Place it near the top of the app
 * tree (inside the root layout) so every client component can call
 * `useTranslation()`.
 */
export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  dictionaries,
  children,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const merged = useMemo(
    () => (dictionaries ? mergeDictionaries(baseDictionaries, dictionaries) : baseDictionaries),
    [dictionaries]
  );

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const base = toBaseLanguage(locale);
      const dict: Dict = merged[base] ?? {};
      const fallback: Dict = merged.en ?? {};
      const template = dict[key] ?? fallback[key] ?? key;
      return format(template, vars);
    },
    [locale, merged]
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeLocaleCookie(next);
    // Inform other tabs / components listening for changes
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("asafarim:locale", { detail: next }));
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** React hook returning the current locale, setter and translate function. */
export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      "useTranslation() must be used inside an <I18nProvider>. " +
        "Wrap your app's root layout with <I18nProvider>."
    );
  }
  return ctx;
}

/** Read the current locale without throwing when no provider is mounted. */
export function useOptionalLocale(): Locale | null {
  const ctx = useContext(I18nContext);
  return ctx?.locale ?? null;
}
