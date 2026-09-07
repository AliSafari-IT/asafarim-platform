import type { Theme } from "./index";

/**
 * Server-safe no-flash theme script.
 *
 * This module intentionally has NO "use client" directive: the script must be
 * rendered by a server component so it exists only in the SSR HTML. When a
 * client component renders an inline <script>, React 19 re-creates the
 * element during hydration and logs
 * "Encountered a script tag while rendering React component…" — and a
 * client-rendered script is never executed.
 *
 * Import it from the `@asafarim/theme-toggle/script` subpath in your root
 * layout; keep using the main entry for ThemeProvider/ThemeToggle.
 */
export function ThemeScript({
  storageKey = "asafarim-theme",
  defaultTheme = "system",
  syncClass,
  nonce,
}: {
  storageKey?: string;
  /** Fallback when nothing is stored: "system" | "light" | "dark". */
  defaultTheme?: "system" | Theme;
  /**
   * Optional class mirrored onto documentElement while the dark theme is
   * active — for apps whose Tailwind config uses `darkMode: "class"` (e.g.
   * testora) and so need a class, not just `data-theme`, to flip `dark:`
   * utilities. Pass the same value to <ThemeProvider>.
   */
  syncClass?: string;
  /**
   * CSP nonce for this request, when the page is served under a strict
   * `script-src` (e.g. the AppBuilder preview route — see proxy.ts). Without
   * it, this inline script is silently blocked by the browser under a
   * nonce/strict-dynamic policy. Read the nonce from the request (e.g. a
   * middleware-set `x-nonce` header) and pass it through here; omit only on
   * pages with no such policy.
   */
  nonce?: string;
}) {
  const js = `(function(){try{
var k=${JSON.stringify(storageKey)};
var d=${JSON.stringify(defaultTheme)};
var s=localStorage.getItem(k);
var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
var t=s|| (d==='system'?sys:d);
document.documentElement.setAttribute('data-theme',t);
var c=${JSON.stringify(syncClass ?? "")};
if(c){document.documentElement.classList.toggle(c,t==='dark');}
}catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: js }} />;
}
