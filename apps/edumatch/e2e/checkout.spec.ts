import { test, expect } from '@playwright/test';
import { STUDENT_STORAGE_STATE } from './global-setup';

/**
 * Checkout error-state coverage, signed in as `demo.student1@edumatch.demo`.
 *
 * The original version of this file pointed every test at a fabricated
 * `test-quote-id` and asserted on copy that doesn't exist in the app
 * ("Complete Booking", "Pay Now") — it never actually reached a real quote.
 * There's no deterministic *payable* quote in the seeded demo data (Stripe
 * isn't configured in dev, and the one seeded booking is already paid), so
 * rather than fabricate one, this covers the one thing that's both real and
 * stable: checkout's handling of a quote that doesn't exist, which is
 * exactly what a stale/expired checkout link produces in production.
 */
test.use({ storageState: STUDENT_STORAGE_STATE });

test.describe('Checkout', () => {
  test('a non-existent quote shows a graceful error, not a crash', async ({ page }) => {
    await page.goto('/student/checkout/does-not-exist');

    await expect(page.getByRole('heading', { name: 'Checkout Error' })).toBeVisible();
    await expect(page.getByRole('link', { name: /back to dashboard/i })).toBeVisible();
  });
});
