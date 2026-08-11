# @asafarim/country-language-selector

Country/language picker UI for the ASafarIM Platform. Provides a
`<CountryLanguageSelector>` React component and locale/region detection
helpers. Used by Vionto, Hub, Showcase, Admin, and EduMatch.

## What's here

- **`<CountryLanguageSelector>`** — accessible dropdown for choosing a
  country and language, styled with the platform design tokens.
- **Country data** — `BENELUX_COUNTRIES`, `COUNTRY_ORDER`,
  `LOCALE_LABELS`, `countryForLocale()`, `CountryCode`,
  `CountryDefinition`.
- **Region detection** — `detectBeneluxRegion()`, `matchLocale()`,
  `DetectedRegion` — resolves a locale from browser/headers.

## Exports

```ts
import { CountryLanguageSelector, BENELUX_COUNTRIES, detectBeneluxRegion } from "@asafarim/country-language-selector";
import "@asafarim/country-language-selector/styles.css";
```

## Dependencies

- `@asafarim/shared-i18n` for locale types and base language mapping.
- `next` for routing (Next.js App Router compatible).

## Scripts

```bash
pnpm --filter @asafarim/country-language-selector lint    # tsc --noEmit
```
