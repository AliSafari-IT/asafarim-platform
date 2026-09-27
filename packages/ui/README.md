# @asafarim/ui

Design system for the ASafarIM Platform — tokens, brand components, and
creative building blocks shared by every app. See
[docs/design-system.md](../../docs/design-system.md) for the full
creative direction, per-app metaphors, and token reference.

## What's here

- **Tokens** (`styles/tokens.css`) — CSS custom properties for color,
  spacing, typography, and per-app mood themes. Dark mode is driven by
  `:root[data-theme="dark"]` (works with `@asafarim/theme-toggle`).
- **Brand** — `<LogoMark />` and `<BrandWordmark />` with
  `ProductName` typing.
- **Layout** — `<AppShell />`, `<TopNav />`, `<SideNav />`,
  `<PageHeader />`, `<Section />`, `<Hero />`, `<Kicker />`.
- **Navigation** — `<AppSwitcher />` (platform app launcher driven by
  `getPlatformLinks()`), `<UserMenu />`.
- **Data display** — `<DataTable />` (typed column defs, selection,
  sorting), `<Card />`, `<Panel />`, `<Badge />`, `<StatusBadge />`,
  `<Metric />`, `<Timeline />`, `<PipelineDiagram />`,
  `<PlatformMap />`, `<ProjectCard />`, `<AppCard />`.
- **Forms** — `<Input />`, `<Select />`, `<Textarea />`, `<Label />`,
  `<FormRow />`, `<FieldError />`, `<FieldHint />`,
  `<ValidationSummary />`.
- **Feedback** — `<Alert />`, `<EmptyState />`, `<ConfirmDialog />`.
- **Bulk actions** — `<BulkActionBar />`, `<SelectAllCheckbox />`,
  `<SelectionCount />`, `<FilterBar />`, `<Pagination />`.
- **Platform links** — `getPlatformLinks()` and
  `toAppSwitcherLinks()` resolve app URLs from `NEXT_PUBLIC_*_URL`
  environment variables; `AppSwitcher` consumes them automatically.

## Localization

Components never depend on an i18n library. Every visible or accessible
string in the shell has an English default and an optional override, so an
app passes already-translated text:

| Component | Prop | Overrides |
|---|---|---|
| `AppShell` | `tagline` | footer text after "ASafariM Digital —" |
| `UserMenu` | `labels` | `accountMenu`, `signedIn`, `viewProfile` |
| `AppSwitcher` | `labels` | `platform`, `platformApps` |
| `TopNav` | `labels` | `navigation` (nav aria-label), `menu` (mobile button) |
| `Roadmap` | `labels` | view names, section titles, `progress` (`{done}`/`{total}` are filled in), `toggle`, `status.*` |

Generic `shell.*` wording for the first four ships in
`@asafarim/shared-i18n`'s base dictionaries:

```tsx
const { t } = await getTranslator(); // app helper around getServerTranslator
<AppShell tagline={t("shell.tagline")} nav={<TopNav items={items} labels={{ navigation: t("shell.navigation"), menu: t("shell.menu") }} />} … />
```

Leaving the props out keeps today's English, so existing apps need no
change. ResuMatch (`apps/resumatch/app/layout.tsx`) is the reference.

## Exports

```ts
import { AppShell, Button, Card, DataTable, getPlatformLinks } from "@asafarim/ui";
import "@asafarim/ui/styles.css";       // tokens + component styles
import "@asafarim/ui/styles/tokens.css"; // tokens only
```

## Scripts

```bash
pnpm --filter @asafarim/ui typecheck
```

No build step — the package exports `.tsx`/`.ts` source directly,
consumed by Next.js apps that compile it through their own bundler.
