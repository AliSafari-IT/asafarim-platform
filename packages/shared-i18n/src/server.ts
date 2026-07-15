import { baseDictionaries, mergeDictionaries } from "./dictionaries";
import { format } from "./format";
import { readLocaleFromCookieHeader } from "./cookie";
import {
  DEFAULT_LOCALE,
  toBaseLanguage,
  type Dict,
  type Dictionaries,
  type Locale,
} from "./types";

/**
 * Resolve the active locale for a server component / route handler by reading
 * the shared `asafarim-lang` cookie. Falls back to `en` when nothing is set.
 */
export function resolveLocaleFromCookie(cookieHeader?: string | null): Locale {
  return readLocaleFromCookieHeader(cookieHeader) ?? DEFAULT_LOCALE;
}

/**
 * Build a server-side translator bound to the given locale and (optional)
 * app-specific dictionaries. Useful in RSC where hooks cannot be used.
 */
export function getServerTranslator(locale: Locale, dictionaries?: Dictionaries) {
  const merged = dictionaries
    ? mergeDictionaries(baseDictionaries, dictionaries)
    : baseDictionaries;
  const base = toBaseLanguage(locale);
  const dict: Dict = merged[base] ?? {};
  const fallback: Dict = merged.en ?? {};

  return function t(key: string, vars?: Record<string, string | number>) {
    const template = dict[key] ?? fallback[key] ?? key;
    return format(template, vars);
  };
}
