import { LOCALE_COOKIE, isLocale, type Locale } from "./types";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Parse a Cookie header string and return the stored locale, if any. */
export function readLocaleFromCookieHeader(cookieHeader?: string | null): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`)
  );
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  return isLocale(value) ? value : null;
}

/** Read the locale cookie from `document.cookie` (browser only). */
export function readLocaleFromDocument(): Locale | null {
  if (typeof document === "undefined") return null;
  return readLocaleFromCookieHeader(document.cookie);
}

/**
 * Persist the locale in a cookie that is shared across asafarim.com subdomains
 * in production and falls back to localhost in development.
 */
export function writeLocaleCookie(locale: Locale) {
  if (typeof document === "undefined") return;
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const domain = host.endsWith(".asafarim.com") ? "; domain=.asafarim.com" : "";
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${domain}`;
}
