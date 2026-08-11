# EduMatch E2E: cross-browser and mobile-viewport coverage

Tracks #164 (part of #89, "Launch readiness"). `playwright.config.ts`
defines five projects — `chromium`, `firefox`, `webkit`, `Mobile Chrome`,
`Mobile Safari` — but #159/#160 only ever ran/verified `chromium`. This
documents actually running the other four, what broke, what got fixed, and
what's a real (undocumented-until-now) platform limitation rather than an
app bug.

## Result

**166 passed, 0 failed, 24 skipped** across all five projects
(`npx playwright test --workers=1`, no `--project` filter). The 24 skips:
20 are the pre-existing environment-conditional skips in
`trust-safety.spec.ts` (4 skips × 5 projects — unrelated to browser
coverage, see that file's own `test.skip(true, "...")` calls), and 4 are
the WebKit tab-order limitation below (2 tests × 2 WebKit-based projects).

## What was found and fixed

### 1. `.fill()` silently no-ops on WebKit for this app's search input

**Symptom**: three `help-center.spec.ts` tests (search, empty-search
state, audience filter) failed on `webkit` and `Mobile Safari` only —
after `.fill('Stripe')`, the page stayed in its default, query-less state
every single time (confirmed via repeated isolated runs, not flaky).

**Root cause**: `HelpSearch.tsx`'s search input is a plain React-controlled
`<input onChange={...}>` with no debounce — filtering is synchronous. But
Playwright's WebKit `.fill()` sets the input's native DOM value without
reliably firing the `input` event React's controlled-component re-render
depends on. Confirmed by comparing `.fill()` against `.click()` +
`.pressSequentially()` (real per-keystroke simulation) in an isolated
debug spec: `pressSequentially` worked identically across all five
projects, `.fill()` only worked on chromium/firefox/Mobile Chrome.

**Fix**: switched those three tests to `.click()` + `.pressSequentially()`
for this specific input. This is a known Playwright+WebKit+React quirk,
not unique to this app — see
[microsoft/playwright#13871](https://github.com/microsoft/playwright/issues/13871)
and similar reports. `pressSequentially` is the standard workaround.

### 2. WebKit doesn't put `<a>` links in the default Tab order

**Symptom**: two keyboard-navigation tests (landing page's primary CTA,
the tutor requests page's back-to-dashboard link) failed on `webkit` and
`Mobile Safari` only — the target link was never reached within the
capped tab budget.

**Root cause**: traced the actual Tab sequence on `/` in WebKit (15 tabs,
logging `document.activeElement` each time) — every stop was a `<button>`;
zero `<a>` elements were ever focused. This is **real Safari/WebKit
default behavior**, not a bug: Safari on macOS excludes links from the
Tab order unless the user has System Settings → Keyboard → "Full Keyboard
Access" enabled — an OS-level setting most users leave off. Chromium and
Firefox both include links in the Tab order by default; WebKit does not.

**Resolution**: **not fixed, and not fixable from the page** — there's no
HTML/CSS/ARIA attribute that opts a link back into WebKit's default Tab
order (a `tabindex="0"` workaround exists but would make the link focusable
via Tab in every browser *except* actually matching real default Safari
behavior, which is the thing being tested). The two affected tests are
skipped specifically on WebKit-based projects
(`test.skip(browserName === 'webkit', ...)`), with the reasoning inlined
in `accessibility.spec.ts`. Every other assertion in those same test files
(automated axe scans, the other keyboard-nav tests using buttons) still
runs and passes on WebKit — this is scoped to exactly the two tests that
depend on link-specific Tab behavior.

This doesn't mean EduMatch is inaccessible to keyboard-only Safari users —
it means Safari's own default keyboard behavior differs from Chromium's,
and a user who relies on keyboard navigation on macOS Safari either already
has Full Keyboard Access enabled (a common accessibility-tooling setting)
or primarily uses VoiceOver (which has its own, different navigation
model entirely, unaffected by this).

## CI browser matrix decision

`.github/workflows/edumatch-e2e.yml`:

- **On every PR** touching EduMatch/Hub/the shared packages: **chromium
  only**. The full 5-project run took ~6.5 minutes locally with an already-
  warm dev server; in CI (cold `npm install`, cold Next.js compile per
  route on first hit, firefox/webkit binary installs) it would be
  meaningfully slower and start blocking normal PR turnaround — exactly
  what #160 was written to avoid.
- **Nightly (`17 4 * * *` UTC) and manual `workflow_dispatch`**: all five
  projects. Nothing is waiting on these runs, so the extra time is free,
  and this is where a real cross-browser regression (not caught by the
  fast chromium-only PR gate) would actually surface.

## Verification

```bash
cd apps/edumatch
npx playwright install --with-deps chromium firefox webkit
DATABASE_URL=... PLAYWRIGHT_TEST_BASE_URL=http://localhost:3009 PLAYWRIGHT_HUB_URL=http://localhost:3001 \
  npx playwright test --workers=1
```

166 passed, 0 failed, 24 skipped (see above).
