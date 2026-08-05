import { test, expect } from '@playwright/test';

test.describe('Checkout Flow', () => {
  test('student can view booking summary', async ({ page }) => {
    await page.goto('/student/checkout/test-quote-id');
    
    await expect(page.getByText('Complete Booking')).toBeVisible();
    await expect(page.getByText('Booking Summary')).toBeVisible();
    await expect(page.getByText('Payment Method')).toBeVisible();
  });

  test('checkout shows pricing breakdown', async ({ page }) => {
    await page.goto('/student/checkout/test-quote-id');
    
    await expect(page.getByText('Session')).toBeVisible();
    await expect(page.getByText('Duration')).toBeVisible();
    await expect(page.getByText('Rate')).toBeVisible();
    await expect(page.getByText('Total')).toBeVisible();
  });

  test('payment button is present', async ({ page }) => {
    await page.goto('/student/checkout/test-quote-id');
    
    await expect(page.getByText('Pay Now')).toBeVisible();
  });
});
