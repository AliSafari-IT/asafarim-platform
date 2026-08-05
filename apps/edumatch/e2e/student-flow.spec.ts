import { test, expect } from '@playwright/test';

test.describe('Student Flow', () => {
  test('student can create inquiry and view AI response', async ({ page }) => {
    // Start at onboarding
    await page.goto('/');
    
    // Select student role
    await page.getByText('Student').click();
    await page.getByText('Continue with Google').click();
    
    // Mock auth - skip to dashboard
    await page.goto('/student');
    await expect(page.getByText('My Learning')).toBeVisible();
    
    // Create new inquiry
    await page.getByText('Ask Question').click();
    await expect(page.getByText('Ask a Question')).toBeVisible();
    
    // Step 1: Select subject
    await page.getByText('Mathematics').click();
    await page.getByText('Undergraduate').click();
    await page.getByText('Continue').click();
    
    // Step 2: Add description
    await page.getByPlaceholder('Type your question here...').fill(
      'Help me understand calculus derivatives'
    );
    await page.getByText('Continue').click();
    
    // Step 3: Submit
    await page.getByText('Submit').click();
    
    // Wait for AI response page
    await expect(page.getByText('AI Explanation')).toBeVisible();
    await expect(page.getByText('Get Tutor Quotes')).toBeVisible();
  });

  test('student can request tutor quotes', async ({ page }) => {
    await page.goto('/student/ai-response?inquiryId=test');
    
    // Request quotes
    await page.getByText('Get Tutor Quotes').click();
    
    // Wait for quotes page
    await expect(page.getByText('Tutor Quotes')).toBeVisible();
    await expect(page.getByText('Waiting for quotes...')).toBeVisible();
  });

  test('student can view inquiry list', async ({ page }) => {
    await page.goto('/student');
    
    await expect(page.getByText('My Learning')).toBeVisible();
    
    // Check for empty state or inquiry list
    const emptyState = page.getByText('No questions yet');
    const inquiryList = page.locator('[data-testid="inquiry-card"]');
    
    await expect(emptyState.or(inquiryList.first())).toBeVisible();
  });
});
