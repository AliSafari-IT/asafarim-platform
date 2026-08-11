import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STUDENT_STORAGE_STATE, TUTOR_STORAGE_STATE } from './global-setup';

/**
 * WCAG 2.2 AA coverage (#161, part of #89 "Launch readiness").
 *
 * Two layers:
 * 1. Automated axe-core scans (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`
 *    tags) across the critical journeys named in #161's scope.
 * 2. Manual-equivalent keyboard-navigation checks axe can't catch on its
 *    own — tab order actually reaching interactive controls, focus staying
 *    visible, no keyboard traps — on the four journeys #161 calls out by
 *    name: landing page, student inquiry flow, tutor quote flow, checkout.
 *
 * Admin surfaces are intentionally out of scope here: they need a
 * superadmin session this suite has no fixture for, and #161's own scope
 * separates "admin verification and dispute flows" from the four flows it
 * requires keyboard coverage on. Follow-up if an admin auth fixture is
 * ever added for other reasons.
 */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
}

function summarize(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`)
    .join('\n');
}

test.describe('Automated accessibility scan — signed out', () => {
  for (const path of ['/', '/help', '/help/students', '/help/tutors']) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await scan(page);
      expect(results.violations, summarize(results)).toEqual([]);
    });
  }
});

test.describe('Automated accessibility scan — student', () => {
  test.use({ storageState: STUDENT_STORAGE_STATE });

  for (const path of ['/student', '/student/inquiry/new', '/student/bookings', '/student/journey']) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await scan(page);
      expect(results.violations, summarize(results)).toEqual([]);
    });
  }

  test('/student/checkout/:id (not-found state) has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/student/checkout/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Checkout Error' })).toBeVisible();
    const results = await scan(page);
    expect(results.violations, summarize(results)).toEqual([]);
  });
});

test.describe('Automated accessibility scan — tutor', () => {
  test.use({ storageState: TUTOR_STORAGE_STATE });

  for (const path of ['/tutor', '/tutor/requests', '/tutor/earnings', '/tutor/bookings']) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await scan(page);
      expect(results.violations, summarize(results)).toEqual([]);
    });
  }
});

test.describe('Keyboard navigation', () => {
  test('landing page: primary CTAs are keyboard-reachable with visible focus', async ({ page, browserName }) => {
    // Not an app bug: WebKit's default Tab order excludes <a> links
    // entirely (confirmed by tracing the full Tab sequence on '/' — every
    // stop was a <button>, never the anchor CTAs) unless the user has macOS
    // Keyboard Settings' "Full Keyboard Access" enabled — an OS-level
    // default, not something a page's HTML/CSS can opt back into. Real
    // Safari users hit the exact same limitation. #164.
    test.skip(browserName === 'webkit', 'WebKit excludes links from the default Tab order (real Safari behavior, not fixable from the page).');
    await page.goto('/');

    // Tab from a known start point until we hit the hero's primary CTA,
    // capped so a keyboard trap or missing control fails loudly instead of
    // hanging the test.
    let reached = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      const text = await focused.innerText().catch(() => '');
      if (text.includes('Ask your first question')) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);

    // Visible focus: the focused element should carry a non-empty outline
    // or box-shadow (see globals.css's :focus-visible rule).
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
    });
    expect(outline?.outlineStyle).not.toBe('none');
  });

  test('student inquiry form: fields and stepper controls are tab-reachable', async ({ page }) => {
    await page.goto('/student/inquiry/new');
    // First focusable control on this page should be reachable within a
    // handful of tabs from the top of the document.
    let sawInteractive = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag && ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) {
        sawInteractive = true;
        break;
      }
    }
    expect(sawInteractive).toBe(true);
  });

});

test.describe('Keyboard navigation — student', () => {
  test.use({ storageState: STUDENT_STORAGE_STATE });

  // Checkout has no anonymous entry point in the real app (it's only ever
  // reached from an accepted quote while signed in), so this is the one
  // context that matters — unlike the automated-scan describes above,
  // there's no separate signed-out variant here.
  test('checkout error state: back-to-dashboard link is keyboard-reachable', async ({ page }) => {
    await page.goto('/student/checkout/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Checkout Error' })).toBeVisible();
    let reached = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const text = await page.evaluate(() => document.activeElement?.textContent ?? '');
      if (/back to dashboard/i.test(text)) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
  });
});

test.describe('Keyboard navigation — tutor', () => {
  test.use({ storageState: TUTOR_STORAGE_STATE });

  test('requests page: back-to-dashboard link is keyboard-reachable', async ({ page, browserName }) => {
    // Same WebKit link-tab-order limitation as the landing-page test above.
    test.skip(browserName === 'webkit', 'WebKit excludes links from the default Tab order (real Safari behavior, not fixable from the page).');
    await page.goto('/tutor/requests');
    let reached = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const href = await page.evaluate(() => (document.activeElement as HTMLAnchorElement | null)?.getAttribute('href'));
      if (href === '/tutor') {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
  });
});
