# Design System — ASafarIM Platform

## Creative direction

The platform is designed as a **digital atelier + mission control**: a place
where practical apps are designed, built, tested, and launched by a real
craftsman. It should feel personal, inventive, warm, and slightly
experimental — never like a generic SaaS template.

Guiding metaphors (used subtly):

| App | Metaphor | Mood |
| --- | --- | --- |
| `web` | **The Studio** — a craftsman's public workshop | Warm paper, ink, serif display type, copper accent |
| `hub` | **Mission Control** — a personal operating system | Warm charcoal, amber accent, soft radial light |
| `showcase` | **The Gallery** — an exhibition wall of real software | Cool dark, emerald accent, dotted grid |
| `admin` | **The Console** — a precise operations room | Near-black, signal green, scanlines, mono labels |

## Brand hierarchy

```txt
Company     ASafarIM Digital
Platform    ASafarIM Platform
Product     ASafarIM Hub (+ Showcase, Admin)
Repo        asafarim-platform
```

Brand components (in `@asafarim/ui`):

- `<LogoMark />` — a monospace "A/" chip; intentional placeholder until a
  designed logo exists. Swappable without touching call sites.
- `<BrandWordmark product="Hub" />` — "ASafarIM" plus a technical product
  chip. Every app header renders `LogoMark + BrandWordmark`.

## Shared DNA vs. per-app mood

**Shared DNA** (identical everywhere): typography scale, spacing rhythm,
radius language (soft `10px` panels, sharp `2px` technical corners), border
treatment, motion (130/240 ms, one easing curve), the kicker micro-label
pattern, focus states, and all components.

**Per-app mood** (varies by design): background color + texture, accent
color, display font (web uses a serif; the rest use the sans stack via
`color-scheme`), card variants in use, and page composition.

The mood is selected with one attribute — nothing else changes per app:

```tsx
<body data-app="web | hub | showcase | admin">
```

## Tokens

Location: `packages/ui/src/styles/tokens.css` (CSS custom properties).

- **Shared** (`:root`): `--font-*`, `--text-*` scale, `--space-1..8`,
  `--radius-*`, `--ease`/`--dur-*`, `--z-*`, `--width-*`.
- **Per mood** (`[data-app=…]`): `--bg`, `--bg-deco` (texture gradients),
  `--surface`/`--surface-2`/`--surface-3`, `--ink`, `--muted`, `--line`,
  `--line-strong`, `--accent`, `--accent-ink`, `--accent-soft`,
  `--accent-2`, `--shadow-1`/`--shadow-2`.

Rules:

- Components reference tokens only — no hard-coded colors in components
  except semantic status hues.
- Apps never invent their own CSS for things the system covers; one-off
  inline styles are allowed only for layout spacing.
- Textures are CSS gradients only (grid lines, radial light, scanlines) —
  no images, no heavy effects, `background-attachment: fixed`.

## Styling approach

One approach: **plain CSS with design tokens**, shipped from
`@asafarim/ui/styles.css` and imported once per app in the root layout:

```tsx
import "@asafarim/ui/styles.css";
```

Files: `tokens.css` (variables), `base.css` (reset, typography, focus,
reduced-motion), `components.css` (`ui-*` classes). No Tailwind, no runtime
CSS-in-JS; components are server-component friendly.

## Components

All in `packages/ui` (only components that are actually used exist):

- **Shell & navigation**: `AppShell` (header/side/footer slots), `TopNav`
  (inline on desktop, CSS-only menu button below 900px — never wraps),
  `SideNav`, `AppSwitcher` (cross-app dropdown), `UserMenu` (avatar-chip
  identity dropdown). Header rule: only in-app links live in the top nav;
  cross-app links go in the AppSwitcher; identity and sign-out live in the
  UserMenu. Dropdowns are `<details>`-based — zero client JS.
- **Brand & rhythm**: `LogoMark`, `BrandWordmark`, `Kicker` (mono
  micro-label with index), `PageHeader`, `Hero`, `Section`
- **Surfaces**: `Card` (variants: `default | elevated | studio | console |
  gallery`), `Panel` (console surface with technical header)
- **Display**: `Badge`, `StatusBadge` (live/beta/planned/archived with
  dot), `Metric` (stat tile), `Timeline` (event stream), `EmptyState`
  (with glyph)
- **Product cards**: `AppCard` (launcher tool tile), `ProjectCard` (gallery
  exhibit with framed glyph, index, tags, status)
- **Actions & forms**: `Button`/`ButtonLink` (variants: `primary |
  secondary | ghost | danger | console`), `Input`, `Textarea`, `Label`,
  `FormRow`, `Alert`
- **Utilities**: `.u-mono`, `.u-muted`, `.ui-grid` (+ `--wide`,
  `--metrics`)

## Interaction & motion

Lightweight and consistent: cards lift 3–4 px with a deepened shadow on
hover, buttons rise 1 px, nav links tint with the accent, the AppCard arrow
slides. One easing curve, durations under 250 ms, everything disabled under
`prefers-reduced-motion`. No animation libraries.

## Accessibility

Semantic headings per page, `:focus-visible` accent outlines, labels bound
to inputs, `aria-current` on active nav, alert roles on form errors,
`color-scheme` per theme, readable contrast on all muted text, decorative
glyphs marked `aria-hidden`.

## Voice

Placeholder copy sounds like ASafarIM Digital, never lorem ipsum:

- "Practical digital products, designed and built end to end."
- "Your workspace for apps, showcases, and experiments."
- "Curated projects from the ASafarIM Digital lab."
- "System access is limited to authorized roles."

## How apps consume the system

1. Root layout: import `@asafarim/ui/styles.css`, set `data-app`, render
   `AppShell` with `product`, nav, and user slots.
2. Pages compose `PageHeader`/`Hero` + `Section` + system components.
3. Need something new? Add it to `packages/ui` with tokens — never fork a
   local copy in an app.
