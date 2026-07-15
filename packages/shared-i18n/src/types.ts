/**
 * Locale identifiers supported across the asafarim-digital platform.
 * Follows BCP-47 with explicit regional variants for the Benelux region.
 */
export const LOCALES = [
  "en",
  "nl-NL",
  "nl-BE",
  "fr-BE",
  "de-BE",
  "fr-LU",
  "de-LU",
] as const;

export type Locale = (typeof LOCALES)[number];

/** Base languages (without region) used to pick the correct dictionary. */
export const BASE_LANGUAGES = ["en", "nl", "fr", "de"] as const;
export type BaseLanguage = (typeof BASE_LANGUAGES)[number];

/** A translation dictionary is a flat map from dot-path keys to strings. */
export type Dict = Record<string, string>;

export type Dictionaries = Partial<Record<BaseLanguage, Dict>>;

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "asafarim-lang";

/** Extract base language from a locale tag (`nl-BE` → `nl`). */
export function toBaseLanguage(locale: string): BaseLanguage {
  const base = locale.toLowerCase().split("-")[0];
  return (BASE_LANGUAGES as readonly string[]).includes(base)
    ? (base as BaseLanguage)
    : "en";
}

/** Type guard for a supported locale. */
export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
