import type { Locale } from "@asafarim/shared-i18n";

export type CountryCode = "NL" | "BE" | "LU";

export type CountryDefinition = {
  code: CountryCode;
  name: string; // English name
  nativeName: string; // common native label
  flag: string; // emoji flag (fallback)
  flagUrl: string; // flag image URL
  /** Languages offered in this country, ordered by preference. */
  languages: Locale[];
};

/** Benelux country → supported locales. English is always available. */
export const BENELUX_COUNTRIES: Record<CountryCode, CountryDefinition> = {
  NL: {
    code: "NL",
    name: "Netherlands",
    nativeName: "Nederland",
    flag: "🇳🇱",
    flagUrl: "https://flagcdn.com/w40/nl.png",
    languages: ["nl-NL", "en"],
  },
  BE: {
    code: "BE",
    name: "Belgium",
    nativeName: "België / Belgique / Belgien",
    flag: "🇧🇪",
    flagUrl: "https://flagcdn.com/w40/be.png",
    languages: ["nl-BE", "fr-BE", "de-BE", "en"],
  },
  LU: {
    code: "LU",
    name: "Luxembourg",
    nativeName: "Luxembourg / Luxemburg",
    flag: "🇱🇺",
    flagUrl: "https://flagcdn.com/w40/lu.png",
    languages: ["fr-LU", "de-LU", "en"],
  },
};

export const COUNTRY_ORDER: CountryCode[] = ["NL", "BE", "LU"];

/** Human-readable labels for each supported locale. */
export const LOCALE_LABELS: Record<Locale, { short: string; long: string }> = {
  en: { short: "EN", long: "English" },
  "nl-NL": { short: "NL", long: "Nederlands (NL)" },
  "nl-BE": { short: "NL", long: "Nederlands (BE)" },
  "fr-BE": { short: "FR", long: "Français (BE)" },
  "de-BE": { short: "DE", long: "Deutsch (BE)" },
  "fr-LU": { short: "FR", long: "Français (LU)" },
  "de-LU": { short: "DE", long: "Deutsch (LU)" },
};

/** Look up the country that a given locale belongs to (or null for `en`). */
export function countryForLocale(locale: Locale): CountryCode | null {
  for (const code of COUNTRY_ORDER) {
    if (BENELUX_COUNTRIES[code].languages.includes(locale) && locale !== "en") {
      return code;
    }
  }
  return null;
}
