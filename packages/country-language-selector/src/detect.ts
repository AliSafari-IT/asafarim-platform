import { DEFAULT_LOCALE, isLocale, type Locale } from "@asafarim/shared-i18n";
import {
  BENELUX_COUNTRIES,
  COUNTRY_ORDER,
  type CountryCode,
} from "./countries";

export type DetectedRegion = {
  country: CountryCode | null;
  language: Locale;
  source: "cookie" | "browser" | "default";
};

/** Best match among supported locales for a raw BCP-47 tag. */
export function matchLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const normalized = tag.trim();
  if (isLocale(normalized)) return normalized;

  // Try regional fallback: "nl" → first nl-* we know about
  const base = normalized.toLowerCase().split("-")[0];
  const lang = base as Locale;
  if (isLocale(lang)) return lang;

  // Scan Benelux countries for any matching language prefix
  for (const code of COUNTRY_ORDER) {
    for (const locale of BENELUX_COUNTRIES[code].languages) {
      if (locale.toLowerCase().startsWith(`${base}-`)) return locale;
    }
  }
  return null;
}

/**
 * Detect the user's Benelux region from their browser locale. Returns English
 * as default when no supported language is found. Pure browser-side helper.
 */
export function detectBeneluxRegion(
  preferredLocales: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages ?? [navigator.language]
    : []
): DetectedRegion {
  for (const raw of preferredLocales) {
    const match = matchLocale(raw);
    if (!match) continue;
    const country = findCountryForLocale(match);
    return { country, language: match, source: "browser" };
  }
  return { country: null, language: DEFAULT_LOCALE, source: "default" };
}

function findCountryForLocale(locale: Locale): CountryCode | null {
  for (const code of COUNTRY_ORDER) {
    if (BENELUX_COUNTRIES[code].languages.includes(locale)) return code;
  }
  return null;
}
