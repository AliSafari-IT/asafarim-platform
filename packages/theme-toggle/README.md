# @asafarim/theme-toggle

Shared light/dark theme system for every ASafarIM app. Provides a
no-flash inline script, a React context provider, and a token-styled
toggle button.

## What's here

- **`<ThemeScript />`** — inline script for `<head>` that sets
  `data-theme` on `<html>` before first paint, respecting the user's
  OS preference (`prefers-color-scheme`) and persisted choice in
  `localStorage`. Prevents the flash-of-wrong-theme on page load.
- **`<ThemeProvider>`** — React context provider that manages the
  theme state, syncs with `localStorage`, and writes `data-theme` to
  `document.documentElement`.
- **`<ThemeToggle />`** — accessible toggle button styled with
  platform tokens, ready to drop into `<AppShell>`'s `user` slot. Its
  aria-label and tooltip default to English; pass `labels={{ toDark,
  toLight, darkTitle, lightTitle }}` to localize them (the
  `shell.theme.*` keys in `@asafarim/shared-i18n` hold EN/NL/FR/DE
  wording).
- **`useTheme()`** — hook returning `{ theme, setTheme, toggle }`.

## Usage

```tsx
import { ThemeScript, ThemeProvider, ThemeToggle } from "@asafarim/theme-toggle";

export default function RootLayout({ children }) {
  return (
    <html>
      <head><ThemeScript /></head>
      <body data-app="web">
        <ThemeProvider>
          <AppShell user={<ThemeToggle />}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

The platform token sheet in `@asafarim/ui` reacts to the theme via:

```css
:root[data-theme="dark"] [data-app="…"] { /* dark token overrides */ }
```

## Dependencies

- `react` and `react-dom` (peer dependencies).

## Scripts

```bash
pnpm --filter @asafarim/theme-toggle typecheck
```
