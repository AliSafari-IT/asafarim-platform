# @asafarim/shared-i18n

Locale resolution, dictionaries, and React i18n provider shared across
the platform. Used by Vionto, Hub, Showcase, Admin, EduMatch,
TimelineAI, and ResuMatch.

## What's here

- **Locale types** — `Locale`, `BaseLanguage`, `Dict`, `Dictionaries`.
  Supported base languages: `en`, `nl`, `fr`, `de`, `lb` (Luxembourgish).
- **Cookie helpers** — `readLocaleFromCookieHeader()`,
  `readLocaleFromDocument()`, `writeLocaleCookie()` with the
  `LOCALE_COOKIE` name and `DEFAULT_LOCALE`.
- **Server helpers** (`/server`) — `resolveLocaleFromCookie()`,
  `getServerTranslator()` for server components and route handlers.
- **React provider** — `<I18nProvider>` and `useTranslation()` hook
  for client components.
- **Base dictionaries** — `en`, `nl`, `fr`, `de`, `lb` blocks with
  platform-wide keys. Apps merge their own dictionaries via
  `mergeDictionaries()`. `shell.*` keys hold the app-shell wording
  (footer tagline, account menu, app switcher, nav, theme toggle) that
  `@asafarim/ui` and `@asafarim/theme-toggle` accept through their
  `labels` / `tagline` props — see the "Localization" section of
  `packages/ui/README.md`. `lb` has no `shell.*` keys yet and falls back
  to English.
- **Plurals** — `format()` has no plural rules; apps use `.one` / `.other`
  key pairs and pick one by count (as ResuMatch does).
- **Format** — `format()` for locale-aware string formatting.

## Exports

```ts
import { I18nProvider, useTranslation, LOCALES, DEFAULT_LOCALE } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie, getServerTranslator } from "@asafarim/shared-i18n/server";
import { en, nl, mergeDictionaries } from "@asafarim/shared-i18n";
```

## Scripts

```bash
pnpm --filter @asafarim/shared-i18n lint    # tsc --noEmit
```
