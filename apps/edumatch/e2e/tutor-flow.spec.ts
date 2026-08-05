import { test, expect } from '@playwright/test';

test.describe('Tutor Flow', () => {
  test('tutor can view dashboard and wallet', async ({ page }) => {
    // Navigate to tutor dashboard
    await page.goto('/tutor');
    
    await expect(page.getByText('Tutor Dashboard')).toBeVisible();
    await expect(page.getByText('Available')).toBeVisible();
    await expect(page.getByText('Pending')).toBeVisible();
    
    // Check quick actions
    await expect(page.getByText('View\nRequests')).toBeVisible();
    await expect(page.getByText('My\nBookings')).toBeVisible();
    await expect(page.getByText('Edit\nProfile')).toBeVisible();
  });

  test('tutor can view quote requests', async ({ page }) => {
    await page.goto('/tutor/quote-requests');
    
    await expect(page.getByText('Quote Requests')).toBeVisible();
    
    // Check for empty state or requests
    const emptyState = page.getByText('No quote requests');
    const requestCard = page.locator('[data-testid="quote-request-card"]');
    
    await expect(emptyState.or(requestCard.first())).toBeVisible();
  });

  test('tutor can view wallet and transactions', async ({ page }) => {
    await page.goto('/tutor/wallet');
    
    await expect(page.getByText('Wallet')).toBeVisible();
    await expect(page.getByText('Available Balance')).toBeVisible();
    await expect(page.getByText('Transaction History')).toBeVisible();
    
    // Request payout button should be present
    await expect(page.getByText('Request Payout')).toBeVisible();
  });

  test('tutor can view bookings', async ({ page }) => {
    await page.goto('/tutor/bookings');
    
    await expect(page.getByText('My Bookings')).toBeVisible();
    
    // Check tabs
    await expect(page.getByText('Upcoming')).toBeVisible();
    await expect(page.getByText('Completed')).toBeVisible();
    await expect(page.getByText('Cancelled')).toBeVisible();
  });
});
