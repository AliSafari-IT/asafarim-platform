import { test, expect } from "@playwright/test";
import { STUDENT_STORAGE_STATE } from "./global-setup";

/**
 * Student dashboard + inquiry-list coverage, signed in as the seeded
 * `asafarim+edustudent01@gmail.com` (see global-setup.ts).
 *
 * The original version of this file scripted a Google-OAuth "mock auth"
 * flow that never actually authenticated anything, then asserted on copy
 * ("My Learning", "Ask Question", "/student/ai-response?inquiryId=test")
 * that doesn't exist anywhere in the current app — every test failed before
 * this rewrite. Assertions below are checked against the live copy in
 * app/student/page.tsx and lib/i18n-dictionaries.ts.
 */
test.use({ storageState: STUDENT_STORAGE_STATE });

test.describe("Student dashboard", () => {
  test("shows the inquiries dashboard for a signed-in student", async ({
    page,
  }) => {
    await page.goto("/student");

    // The site footer repeats "Ask a Question" as a plain sitemap link, so
    // scope to <main> — the dashboard's own copy of these controls.
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: "My Inquiries" })
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: "Ask a Question" })
    ).toBeVisible();
    await expect(main.getByRole("link", { name: "My Bookings" })).toBeVisible();
  });

  test("lists inquiries or shows the empty state", async ({ page }) => {
    await page.goto("/student");

    const emptyState = page.getByText("No inquiries yet");
    // Inquiry cards are plain <Link>s to /student/inquiry/[id]; there's no
    // data-testid on them, so match by href pattern instead.
    const inquiryCard = page.locator('a[href*="/student/inquiry/"]');

    await expect(emptyState.or(inquiryCard.first())).toBeVisible();
  });

  test("opening an inquiry card leads to its detail page", async ({ page }) => {
    await page.goto("/student");

    const inquiryCard = page.locator('a[href*="/student/inquiry/"]').first();
    if ((await inquiryCard.count()) === 0) {
      test.skip(true, "Demo student has no inquiries in this environment.");
    }

    await inquiryCard.click();
    await expect(page).toHaveURL(/\/student\/inquiry\/[^/]+$/);
  });
});
