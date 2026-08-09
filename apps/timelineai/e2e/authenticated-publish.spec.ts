import { test, expect } from "@playwright/test";
import { signInViaHub } from "./fixtures";

// Spec §16 e2e happy path #1: "An authenticated user creating and
// self-publishing a timeline."

test("authenticated user creates a timeline and self-publishes it, no admin review needed", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await signInViaHub(context);
  const page = await context.newPage();

  await page.goto("/create");
  await expect(page.getByText(/reviewed by an admin/i)).not.toBeVisible();

  const title = `E2E Self-Publish ${Date.now()}`;
  await page.getByPlaceholder("e.g. Our company's first year").fill(title);
  await page.getByPlaceholder("What happened?").fill("Founded on a Tuesday.");
  await page.getByRole("button", { name: /save timeline/i }).click();

  await page.waitForURL(/\/t\//, { timeout: 15_000 });
  const publicUrl = page.url();

  // Not published yet — draft/private by default (spec §8).
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  const draftResponse = await anonPage.goto(publicUrl);
  expect(draftResponse?.status()).toBe(404);
  await anonContext.close();

  // Publish from the dashboard.
  await page.goto("/dashboard");
  await expect(page.getByText(title)).toBeVisible();
  const row = page.locator("li", { hasText: title });
  await row.getByRole("button", { name: /^publish$/i }).click();
  await expect(row.getByText("Published", { exact: true })).toBeVisible();

  // Now anonymous visitors can see it — self-publish needed no admin.
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const response = await publicPage.goto(publicUrl);
  expect(response?.status()).toBe(200);
  await expect(publicPage.getByText(title)).toBeVisible();
  await publicContext.close();

  await context.close();
});
