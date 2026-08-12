import { test, expect } from "@playwright/test";
import { STUDENT_STORAGE_STATE, TUTOR_STORAGE_STATE } from "./global-setup";

/**
 * Help Center coverage. Signed-out tests below need no auth. The two
 * contextual-link tests at the bottom need a real session — see
 * global-setup.ts for how the seeded student/tutor aliases authenticate.
 */

test.describe("Help Center", () => {
  test("is reachable while signed out and shows both audiences", async ({
    page,
  }) => {
    await page.goto("/help");
    await expect(
      page.getByRole("heading", { name: "Help Center" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Help for students/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Help for tutors/i })
    ).toBeVisible();
  });

  test("searching for an article and opening it", async ({ page }) => {
    await page.goto("/help");
    const search = page.getByLabel("Search the Help Center");
    // pressSequentially, not fill: WebKit's .fill() sets the input's native
    // value but doesn't reliably fire the input event React's controlled
    // component depends on to re-render — real per-character keystrokes do.
    // Confirmed via isolated debugging (#164): .fill() left the page in its
    // default, query-less state every time on webkit/Mobile Safari, while
    // pressSequentially worked identically across all five projects.
    await search.click();
    await search.pressSequentially("Stripe");
    await expect(
      page.getByText("Getting paid: Stripe Connect, earnings, and settings")
    ).toBeVisible();
    await page
      .getByText("Getting paid: Stripe Connect, earnings, and settings")
      .click();
    await expect(page).toHaveURL(/\/help\/tutors\/payments-and-settings$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Stripe Connect"
    );
  });

  test("an unmatched search shows the empty state, not a blank page", async ({
    page,
  }) => {
    await page.goto("/help");
    const search = page.getByLabel("Search the Help Center");
    await search.click();
    await search.pressSequentially("xyznonexistentquery123");
    await expect(
      page.getByText("No guides matched that search.")
    ).toBeVisible();
  });

  test("audience filter narrows results to the selected role", async ({
    page,
  }) => {
    await page.goto("/help");
    const search = page.getByLabel("Search the Help Center");
    await search.click();
    await search.pressSequentially("bookings");
    await page.getByRole("button", { name: "Tutors", exact: true }).click();
    await expect(
      page.getByText("Managing bookings and responding to disputes")
    ).toBeVisible();
    await expect(
      page.getByText("Managing bookings, cancellations, and disputes")
    ).toHaveCount(0);
  });

  test("student index and article pages render with working prev/next", async ({
    page,
  }) => {
    await page.goto("/help/students");
    await expect(
      page.getByRole("heading", { name: "Help for students" })
    ).toBeVisible();
    await page
      .getByRole("link", { name: /Signing in and finding your way around/i })
      .click();
    await expect(page).toHaveURL(/\/help\/students\/getting-started$/);
    await expect(
      page.getByRole("heading", { name: "Step-by-step" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Next guide/i })).toBeVisible();
  });

  test("switching locale updates Help Center copy without breaking navigation", async ({
    page,
  }) => {
    await page.goto("/help");
    await page.evaluate(() => {
      document.cookie = "asafarim-lang=nl-BE; path=/";
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Helpcentrum" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Help voor studenten/i })
    ).toBeVisible();
    // Article content should be Dutch too, not silently English.
    await page.goto("/help/students/getting-started");
    await expect(
      page.getByRole("heading", { name: "Aanmelden en je weg vinden" })
    ).toBeVisible();
  });

  test('student navigates from "Ask a question" to its contextual guide', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: STUDENT_STORAGE_STATE,
    });
    const page = await context.newPage();
    await page.goto("/student/inquiry/new");
    await page.getByRole("link", { name: "How this works" }).click();
    await expect(page).toHaveURL(/\/help\/students\/ask-a-question$/);
    await context.close();
  });

  test("tutor navigates from the quote form to its contextual guide", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: TUTOR_STORAGE_STATE,
    });
    const page = await context.newPage();
    await page.goto("/tutor/requests");
    await page.getByRole("link", { name: "How this works" }).click();
    await expect(page).toHaveURL(
      /\/help\/tutors\/finding-and-quoting-requests$/
    );
    await context.close();
  });
});
