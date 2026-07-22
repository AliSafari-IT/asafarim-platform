import { test, expect } from "@playwright/test";
import { authedContext } from "../fixtures/testContext";

/**
 * Backfills the most important M05 browser flow, which the M05 PR shipped
 * without a Playwright harness (58 integration tests covered the repository
 * layer, but no browser automation existed yet — see PR #46's "Deferred"
 * section). This is the first real browser coverage of create → catalog →
 * continuation → archive → restore.
 */
test("create app -> see it in /apps -> open continuation page -> archive and restore it", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  const appName = `E2E Lifecycle App ${Date.now()}`;

  await page.goto("/apps/new");
  await page.fill("#field-name", appName);
  await page.fill("#field-prompt", "Track lifecycle test records created by the Playwright suite.");
  await page.getByRole("button", { name: "Create draft application" }).click();

  // POST -> redirect -> GET lands on the continuation page.
  await page.waitForURL(/\/apps\/[^/]+$/);
  await expect(page.getByRole("heading", { name: appName })).toBeVisible();
  const appUrl = page.url();
  const appId = appUrl.split("/apps/")[1];

  // The new app shows up in the catalog.
  await page.goto("/apps");
  await expect(page.getByRole("link", { name: appName })).toBeVisible();

  // Continue -> archive.
  await page.getByRole("link", { name: appName }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}$`));
  await page.getByRole("link", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive this app" }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}$`));
  await expect(page.getByText("Archived")).toBeVisible();

  // Archived apps drop out of the default (active) catalog view...
  await page.goto("/apps");
  await expect(page.getByRole("link", { name: appName })).toHaveCount(0);
  // ...but remain visible under the archived filter.
  await page.goto("/apps?status=archived");
  await expect(page.getByRole("link", { name: appName })).toBeVisible();

  // Restore.
  await page.goto(`/apps/${appId}/restore`);
  await page.getByRole("button", { name: "Restore this app" }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}$`));
  await expect(page.getByText("Active")).toBeVisible();

  await context.close();
});
