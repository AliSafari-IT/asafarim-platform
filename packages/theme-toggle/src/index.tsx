"use client";

/**
 * @asafarim/theme-toggle
 *
 * A small, framework-light light/dark theme system shared by every ASafarIM
 * app. It writes the chosen theme to `document.documentElement` as
 * `data-theme="light|dark"`, persists it to localStorage, and respects the
 * OS preference until the user makes an explicit choice.
 *
 * The platform token sheet reacts to it with:
 *   :root[data-theme="dark"] [data-app="…"] { …dark tokens… }
 *
 * Usage (Next.js app-router layout):
 *   <html>
 *     <head><ThemeScript /></head>
 *     <body data-app="web">
 *       <ThemeProvider><AppShell user={<ThemeToggle />}>…</AppShell></ThemeProvider>
 *     </body>
 *   </html>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

const DEFAULT_STORAGE_KEY = "asafarim-theme";

/* ─── No-flash script ─────────────────────────────────────────────
 * Rendered into <head>; runs before first paint so the correct theme
 * is applied with no flash. It only touches documentElement (which
 * exists during head parsing) — never the body.
 */
export function ThemeScript({
  storageKey = DEFAULT_STORAGE_KEY,
  defaultTheme = "system",
}: {
  storageKey?: string;
  /** Fallback when nothing is stored: "system" | "light" | "dark". */
  defaultTheme?: "system" | Theme;
}) {
  const js = `(function(){try{
var k=${JSON.stringify(storageKey)};
var d=${JSON.stringify(defaultTheme)};
var s=localStorage.getItem(k);
var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
var t=s|| (d==='system'?sys:d);
document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

/* ─── Context ──────────────────────────────────────────────────── */
interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(storageKey: string, fallback: Theme): Theme {
  if (typeof document === "undefined") return fallback;
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  const stored = safeGet(storageKey);
  if (stored === "light" || stored === "dark") return stored;
  return fallback;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore (private mode / disabled storage) */
  }
}

export function ThemeProvider({
  children,
  storageKey = DEFAULT_STORAGE_KEY,
  defaultTheme = "light",
}: {
  children: ReactNode;
  storageKey?: string;
  /** Fallback theme before hydration / when nothing is stored. */
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  // Sync from the DOM/localStorage once mounted (the no-flash script has run).
  useEffect(() => {
    setThemeState(readInitialTheme(storageKey, defaultTheme));
  }, [storageKey, defaultTheme]);

  const apply = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      apply(next);
      safeSet(storageKey, next);
    },
    [apply, storageKey]
  );

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Follow the OS preference until the user has made an explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (safeGet(storageKey)) return; // user chose explicitly → don't override
      const sys: Theme = mq.matches ? "dark" : "light";
      setThemeState(sys);
      apply(sys);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [apply, storageKey]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>.");
  }
  return ctx;
}

/* ─── Toggle button ────────────────────────────────────────────── */
function SunIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </svg>
  );
}
function MoonIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

/**
 * A token-styled icon button that flips the theme. Inherits each app's look
 * from CSS custom properties, so it matches Studio, Hub, Admin, etc.
 */
export function ThemeToggle({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Before mount the theme isn't known — render a neutral icon to avoid a
  // hydration mismatch, then swap to the real one.
  const isDark = mounted && theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2.25rem",
        height: "2.25rem",
        borderRadius: "999px",
        border: "1px solid var(--line, #ccc)",
        background: "var(--surface, transparent)",
        color: "var(--ink, currentColor)",
        cursor: "pointer",
        transition: "border-color 160ms ease, color 160ms ease",
      }}
    >
      {isDark ? <SunIcon size={size} /> : <MoonIcon size={size} />}
    </button>
  );
}
