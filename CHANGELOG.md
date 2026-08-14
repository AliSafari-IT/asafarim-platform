# Changelog

Hand-curated summary of notable feature work. For a full commit-by-commit
feed generated from git history, see the [proof board](https://showcase.asafarim.com/proof)
(`apps/showcase/public-data/changelog.json`, regenerated automatically by
`scripts/generate-changelog.mjs` on every push to `main`).

## 2026-08-14 — EduMatch: Business Plan (admin-only)

A superadmin-only Business Plan section was added to EduMatch, reachable
from the app's admin navbar (`/admin/business-plan`), covering the product
strategy, market positioning, and supporting architecture/journey diagrams
used to pitch and reason about the product.

**Access:** EduMatch admin navbar → "Business Plan" (superadmin role only,
gated via `EduNav.tsx` / route auth).

- **Main page** — `/admin/business-plan`
  - Product overview, monetization model (freemium funnel, no-listing-fee
    framing), and roadmap.
  - **Part 0 — "The market: Belgium first, Europe next"**: Belgian
    shadow-education context (CE1D/CESS/Examencommissie), competitive
    quadrant vs. HelloProf, BijlesHuis, Superprof, Eduvik, Apprentus, a
    full SWOT, and a 4-phase expansion roadmap (Belgium → Benelux → Core
    Europe → Global).
  - Embedded diagrams: competitive-landscape quadrant chart, help-first
    user-journey flowchart (`FlowChart`/`FlowDown` components).
  - Theme-aware CTA buttons ("View captured screens", "View architecture
    review") — fixed a light-theme contrast bug via a new
    `--color-on-primary` design token in `globals.css`.
- **Appendix / sub-pages**
  - `/admin/business-plan/architecture` — architecture review, with the
    tech-stack component diagram.
  - `/admin/business-plan/summary` — one-page executive summary, extracted
    alongside a shared `AboutThisProjectView` used by the public
    "Behind EduMatch" page (`/about-this-project`).
  - `/admin/business-plan/screenshots` — captured product screenshots
    supporting the plan.
- Static SVG/PNG assets under
  `apps/edumatch/public/business-plan-screenshots/`
  (`BelgianPrivateTutoringLandscape.svg`, `TechStackArchitecture.svg`,
  `UserJourneyFlowchart.svg`, plus captured product screenshots).

**Commits:**
- [`f510c90`](https://github.com/AliSafari-IT/asafarim-platform/commit/f510c90) — original `/admin/business-plan` page, `_shared.ts`, and `screenshots` sub-page
- [`54a5356`](https://github.com/AliSafari-IT/asafarim-platform/commit/54a5356) — add `FlowChart`/`FlowDown` components to the business plan page
- [`fc88b08`](https://github.com/AliSafari-IT/asafarim-platform/commit/fc88b08) — extract `AboutThisProjectView`, add one-page summary + architecture review sub-pages
- [`8dfa9dc`](https://github.com/AliSafari-IT/asafarim-platform/commit/8dfa9dc) / [`df5bf67`](https://github.com/AliSafari-IT/asafarim-platform/commit/df5bf67) / [`7ceee4b`](https://github.com/AliSafari-IT/asafarim-platform/commit/7ceee4b) ([#185](https://github.com/AliSafari-IT/asafarim-platform/pull/185)) — market/GTM (Part 0) section, embedded diagrams, and CTA contrast fix

**Related:**
- [#106](https://github.com/AliSafari-IT/asafarim-platform/pull/106) — public "Behind EduMatch" page (`/about-this-project`), the public-facing counterpart to this admin-only plan
- [#133](https://github.com/AliSafari-IT/asafarim-platform/pull/133) — "showcase project" positioning shared across public product apps, incl. EduMatch
