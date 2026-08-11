# EduMatch accessibility audit (WCAG 2.2 AA)

Tracks #161 (part of #89, "Launch readiness"). Covers the critical journeys
named in #161's scope: landing page, student inquiry-to-booking, tutor
quote-to-session, checkout. Admin verification/dispute flows are **not**
covered yet — see "Not covered" below.

## Method

- **Automated**: [`@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright)
  scanning `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` rule tags, run against
  every page below in both a signed-out context and a signed-in student/tutor
  session (via the demo-account fixture from #159). Committed as
  `apps/edumatch/e2e/accessibility.spec.ts` — runs in CI as part of the
  EduMatch E2E workflow (#160), so this isn't a one-time audit; regressions
  fail the build going forward.
- **Keyboard navigation**: explicit tab-order checks in the same spec — a
  known target control must be reachable within a bounded number of `Tab`
  presses (catches both "control isn't focusable" and "focus is trapped").
  Also asserts the landing page's focused element carries a visible
  `outline` (not `none`), i.e. `:focus-visible` isn't being suppressed.
- **Screen reader / color contrast**: covered by the automated scan above —
  axe's `color-contrast` rule is what actually caught the violations below;
  a manual VoiceOver/NVDA pass was not additionally performed for this round
  and would be a reasonable follow-up if a specific journey is flagged later.

## Pages scanned

| Journey | Path | Session |
|---|---|---|
| Landing | `/` | signed out |
| Help Center | `/help`, `/help/students`, `/help/tutors` | signed out |
| Student dashboard | `/student` | student |
| Student inquiry form | `/student/inquiry/new` | student |
| Student bookings | `/student/bookings` | student |
| Student learning journey | `/student/journey` | student |
| Checkout (not-found state) | `/student/checkout/:id` | student |
| Tutor dashboard | `/tutor` | tutor |
| Tutor quote requests | `/tutor/requests` | tutor |
| Tutor earnings | `/tutor/earnings` | tutor |
| Tutor bookings | `/tutor/bookings` | tutor |

Checkout's *happy path* (a real, payable quote) isn't scanned: there's no
deterministic payable quote in the seeded demo data (Stripe isn't configured
in dev, and the one seeded booking is already paid — see #159's notes on the
same constraint). The not-found state exercises the same layout shell and
was where the one checkout-specific violation actually was.

## Violations found and fixed

All four were caught by the automated scan on the first run against `main`
and fixed in the same PR that added this audit.

1. **Insufficient color contrast, `bg-[var(--color-primary)]` + `text-white`
   (serious, WCAG 1.4.3)** — the dark theme's `--color-primary` (`#7d9bff`,
   the app's default theme) against white text is 2.62:1, well under the
   4.5:1 AA minimum for normal text. This wasn't a one-off: the same class
   pairing appeared **45 times across 22 files** (every "primary" button and
   active-state pill in the app). Fixed by switching to `text-[#07101a]`
   (dark text), matching the contrast-safe pattern the landing page's own
   `.edu-button-primary` already used. Re-verified against the full set of
   scanned pages above — no remaining instances of the failing pairing on
   any of them.
2. **Insufficient color contrast, checkout error CTA (serious, WCAG 1.4.3)**
   — `bg-red-600` (Tailwind v4's `#e7000b`) with white text was 4.37:1,
   just under 4.5:1. Fixed by moving to `bg-red-700`/`hover:bg-red-800`.
3. **Select element has no accessible name (critical, WCAG 4.1.2)** — the
   subject `<select>` on `/student/inquiry/new` had a visually adjacent
   `<label>` that wasn't programmatically associated (no `htmlFor`/`id`
   pairing). Fixed by adding the pairing.
4. **Select element has no accessible name (critical, WCAG 4.1.2)** — the
   per-slot session-mode `<select>` on `/tutor/requests` (inside the "submit
   a quote" form) had no label or `aria-label` at all, unlike its sibling
   start/end time inputs. Fixed by adding
   `aria-label={t("edumatch.requests.slots.modeLabel")}`, translated in all
   four locales (en/nl/fr/de).

## Keyboard navigation

Verified end-to-end (tab order reaches the target control, no trap) on:

- Landing page → hero primary CTA, with visible focus confirmed
  (`:focus-visible` outline present, not suppressed)
- Student inquiry form (`/student/inquiry/new`) → first interactive field
- Tutor quote-requests page (`/tutor/requests`) → back-to-dashboard link
- Checkout error state (`/student/checkout/:id`) → back-to-dashboard link,
  signed in as a student (checkout has no anonymous entry point in the real
  app)

No keyboard traps or unreachable controls found on any of the four.

## Not covered (tracked separately)

- **Admin verification and dispute flows** (`/admin/*`) — #161's scope lists
  these, but there's no admin-session Playwright fixture yet (the demo
  student/tutor accounts from #159 aren't admins, and minting a throwaway
  superadmin session needs its own decision about credentials/seeding). Left
  as a follow-up rather than reusing real admin credentials in a committed
  test fixture.
- **Screen-reader manual pass** — the method note above covers what this
  round actually did (axe's automated checks, which cover most
  screen-reader-relevant issues like accessible names and semantic
  structure) versus a live VoiceOver/NVDA walkthrough, which wasn't done.
- **Checkout happy path** — no deterministic payable quote in seed data (see
  above); only the not-found state was scanned.
