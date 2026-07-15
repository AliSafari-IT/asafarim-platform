export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "asafarim-theme";
export const THEME_COOKIE_KEY = "asafarim-theme";

const LEGACY_THEME_STORAGE_KEYS = ["theme"] as const;

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function getStoredTheme(storage: Storage): Theme | null {
  const primaryTheme = storage.getItem(THEME_STORAGE_KEY);
  if (isTheme(primaryTheme)) return primaryTheme;

  for (const legacyKey of LEGACY_THEME_STORAGE_KEYS) {
    const legacyTheme = storage.getItem(legacyKey);
    if (isTheme(legacyTheme)) return legacyTheme;
  }

  return null;
}

/** Read theme from cookie string (works in both browser and server contexts) */
export function readThemeFromCookie(cookieHeader?: string | null): Theme | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE_KEY}=([^;]+)`));
  const value = match?.[1];
  return isTheme(value) ? value : null;
}

export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Read theme from document.cookie in the browser */
function readThemeFromBrowserCookie(): Theme | null {
  if (typeof document === "undefined") return null;
  return readThemeFromCookie(document.cookie);
}

export function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";

  // 1) Prefer cookie (shared across subdomains / localhost ports)
  const cookieTheme = readThemeFromBrowserCookie();
  if (cookieTheme) return cookieTheme;

  // 2) Fall back to localStorage (app-local)
  try {
    return getStoredTheme(window.localStorage) ?? getSystemTheme();
  } catch {
    return getSystemTheme();
  }
}

/**
 * Subscribe to cross-app / cross-tab theme changes.
 * Triggers `onChange` whenever the shared cookie value differs from current.
 * Returns an unsubscribe function.
 */
export function subscribeThemeChanges(onChange: (theme: Theme) => void): () => void {
  if (typeof window === "undefined") return () => {};

  let current = readTheme();

  const check = () => {
    const next = readTheme();
    if (next !== current) {
      current = next;
      onChange(next);
    }
  };

  // Same-origin localStorage change (other tabs of same app)
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === "theme" || e.key === null) check();
  };

  // Cookies don't emit events — re-check on tab focus / visibility change
  const onFocus = () => check();
  const onVisibility = () => {
    if (document.visibilityState === "visible") check();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  // Light polling as last-resort safety net (cookies may change while tab is focused)
  const interval = window.setInterval(check, 2000);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(interval);
  };
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** Set cookie for cross-origin theme sharing (localhost ports, subdomains) */
function setThemeCookie(theme: Theme) {
  try {
    const maxAge = 60 * 60 * 24 * 365; // 1 year
    const domain = typeof window !== "undefined" && window.location.hostname.includes(".")
      ? `; domain=.${window.location.hostname.split(".").slice(-2).join(".")}`
      : ""; // no domain for localhost
    document.cookie = `${THEME_COOKIE_KEY}=${theme}; path=/; max-age=${maxAge}; SameSite=Lax${domain}`;
  } catch {
    // Ignore cookie failures in restricted browsing contexts.
  }
}

export function persistTheme(theme: Theme) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    for (const legacyKey of LEGACY_THEME_STORAGE_KEYS) {
      window.localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore storage failures in restricted browsing contexts.
  }

  setThemeCookie(theme);
}

export function initializeTheme() {
  const theme = readTheme();
  applyTheme(theme);
  persistTheme(theme);
  return theme;
}

export const themeInitScript = `(() => {
  try {
    const isTheme = (value) => value === 'light' || value === 'dark';
    const storage = window.localStorage;

    // Try cookie first (shared across localhost ports / subdomains)
    let theme = null;
    try {
      const cookieMatch = document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE_KEY}=([^;]+)/);
      const cookieValue = cookieMatch && cookieMatch[1];
      if (isTheme(cookieValue)) theme = cookieValue;
    } catch (e) {}

    // Fall back to localStorage
    if (!isTheme(theme)) {
      theme = storage.getItem('${THEME_STORAGE_KEY}');
    }

    if (!isTheme(theme)) {
      const legacyTheme = storage.getItem('theme');
      theme = isTheme(legacyTheme) ? legacyTheme : null;
    }

    if (!isTheme(theme)) {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    storage.setItem('${THEME_STORAGE_KEY}', theme);
    storage.removeItem('theme');
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();`;
