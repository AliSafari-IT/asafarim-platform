import { test, expect } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

test.describe("signed-out boundary", () => {
  test("a signed-out preview request redirects to Hub's centralized sign-in with a callback back to this preview", async ({ page }) => {
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);
    await page.waitForURL(/localhost:3001\/sign-in/);
    const url = new URL(page.url());
    expect(url.origin).toBe("http://localhost:3001");
    expect(url.pathname).toBe("/sign-in");
    const callbackUrl = url.searchParams.get("callbackUrl");
    expect(callbackUrl).toBeTruthy();
    // Must be an absolute URL back to AppBuilder — a relative path here would
    // resolve against Hub's own origin instead (see lib/auth/session.ts).
    expect(callbackUrl).toContain("localhost:3006");
    expect(callbackUrl).toContain(`/apps/${fixtures.demoAppId}/preview`);
  });
});

test.describe("capability matrix", () => {
  test("the owner can open the preview", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    const response = await page.goto(`/apps/${fixtures.demoAppId}/preview`);
    expect(response?.status()).toBe(200);
    // The fixture's own branding.companyName ("BuildRight Construction")
    // is what's shown in the shell header, not the app's own name — see
    // @asafarim/appbuilder-schema's constructionTaskManagementFixture.
    await expect(page.getByText("BuildRight Construction")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await context.close();
  });

  test("an editor collaborator can open the preview", async ({ browser }) => {
    const context = await authedContext(browser, "editor");
    const page = await context.newPage();
    const response = await page.goto(`/apps/${fixtures.demoAppId}/preview`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".ab-shell")).toBeVisible();
    await context.close();
  });

  test("a viewer collaborator can open the preview (viewPreview is a viewer-level capability)", async ({ browser }) => {
    const context = await authedContext(browser, "viewer");
    const page = await context.newPage();
    const response = await page.goto(`/apps/${fixtures.demoAppId}/preview`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".ab-shell")).toBeVisible();
    await context.close();
  });

  test("an unrelated, authenticated user gets a leak-safe not-found — never a distinguishing forbidden page", async ({ browser }) => {
    const context = await authedContext(browser, "unrelated");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});

test.describe("archived-app policy", () => {
  test("an archived app still renders its last successful preview (documented view-only policy)", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    const response = await page.goto(`/apps/${fixtures.archivedAppId}/preview`);
    expect(response?.status()).toBe(200);
    await expect(page.locator(".ab-shell")).toBeVisible();
    await context.close();
  });
});

test.describe("no-preview state", () => {
  test("an app with no successful build shows a truthful 'no preview yet' state, not an error", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    const response = await page.goto(`/apps/${fixtures.noPreviewAppId}/preview`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("This app doesn't have a preview yet")).toBeVisible();
    await context.close();
  });
});
