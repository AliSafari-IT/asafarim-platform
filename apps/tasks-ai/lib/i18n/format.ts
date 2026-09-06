import { toBaseLanguage } from "@asafarim/shared-i18n";

/**
 * Locale-aware formatting (docs: M11 "locale-aware dates, time zones, week
 * starts, number formats"). Thin wrappers over `Intl` so there is one place
 * that knows the rules, and it is unit-tested for the launch locales.
 */
export function formatDate(iso: string | Date, locale: string, tz?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: tz }).format(
    typeof iso === "string" ? new Date(iso) : iso,
  );
}

export function formatDateTime(iso: string | Date, locale: string, tz?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: tz,
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatNumber(n: number, locale: string, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(n);
}

/** Relative day label ("in 2 days", "yesterday") for the given locale. */
export function formatRelativeDays(days: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return rtf.format(Math.round(days), "day");
}

/**
 * ISO week (Mon-first) for nl/fr/de; Sun-first for en. Returned as the
 * `Intl`-style weekday index (0 = Sunday) for the first day of the week.
 */
export function weekStartsOn(locale: string): 0 | 1 {
  const base = toBaseLanguage(locale);
  return base === "en" ? 0 : 1;
}

/** The dates of the week containing `date`, in locale week order. */
export function weekDates(date: Date, locale: string): Date[] {
  const start = weekStartsOn(locale);
  const d = new Date(date);
  const shift = (d.getDay() - start + 7) % 7;
  d.setDate(d.getDate() - shift);
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}
