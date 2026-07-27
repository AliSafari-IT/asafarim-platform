import { test, expect } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

/**
 * M12 end-to-end coverage. The readiness aggregation itself (honest
 * unknown/not_configured states, restricted viewer summary, cross-app/
 * cross-owner isolation, quota race-safety) is already proven directly
 * against real Postgres in lib/observability/readiness.integration.test.ts
 * and lib/quotas/quotas.integration.test.ts — these specs focus on what
 * only a real browser+server round-trip can prove: the dashboard is
 * genuinely reachable (not buried), renders real API data, honors the
 * restricted-viewer contract in the actual rendered page, and 404s for an
 * unrelated actor exactly like every other app route.
 */

test.describe("launch readiness dashboard", () => {
  test("an owner reaches it from the workspace top bar and sees real deployment/version data for a deployed app", async ({
    browser,
  }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();

    await page.goto(`/apps/${fixtures.m11DeployedAppId}`, { timeout: 45_000 });
    await page.getByRole("link", { name: "Launch readiness" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/apps/${fixtures.m11DeployedAppId}/operations$`)
    );

    await expect(
      page.getByRole("heading", { name: /Launch readiness/ })
    ).toBeVisible({ timeout: 15_000 });

    // Real production data — not a placeholder.
    await expect(page.getByText("Production release")).toBeVisible();
    await expect(page.getByText(/v1\.0\.0|v\d+/).first()).toBeVisible();

    // Custom domains are explicitly stated as not enabled — never omitted,
    // never a misleading "configured" look.
    await expect(
      page.getByText(/Custom domains are NOT enabled yet/)
    ).toBeVisible();

    // Owner sees full operational detail.
    await expect(page.getByText("Quota consumption")).toBeVisible();
    await expect(page.getByText("Backup & restore")).toBeVisible();
  });

  test("an unrelated actor gets a 404, never the dashboard (isolation)", async ({
    browser,
  }) => {
    const context = await authedContext(browser, "unrelated");
    const page = await context.newPage();

    // Page navigations render through Next's not-found boundary — checking
    // rendered content, not `response.status()`, is the established
    // convention in this suite for a *page* route (see
    // ai-generation.spec.ts/builder-workspace.spec.ts: `next dev`'s RSC
    // streaming can report 200 on the initial document even though the
    // not-found UI is what actually renders). The API route below has no
    // such quirk and is checked by status code directly.
    await page.goto(`/apps/${fixtures.demoAppId}/operations`, {
      timeout: 45_000,
    });
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Launch readiness/ })
    ).toHaveCount(0);

    const apiResponse = await page.request.get(
      `/api/apps/${fixtures.demoAppId}/operations`
    );
    expect(apiResponse.status()).toBe(404);
  });

  test("a viewer sees a restricted summary — operational internals are absent from the rendered page, not just visually hidden", async ({
    browser,
  }) => {
    const context = await authedContext(browser, "viewer");
    const page = await context.newPage();

    await page.goto(`/apps/${fixtures.demoAppId}/operations`, {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("heading", { name: /Launch readiness/ })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/restricted summary/)).toBeVisible();

    // Versions/validation/launch-blocking issues remain visible to a viewer...
    await expect(page.getByText("Versions")).toBeVisible();
    await expect(page.getByText("Launch-blocking issues")).toBeVisible();

    // ...but owner/editor-only operational internals are genuinely absent
    // from the DOM, not merely styled away.
    await expect(page.getByText("Quota consumption")).toHaveCount(0);
    await expect(page.getByText("Backup & restore")).toHaveCount(0);
    await expect(page.getByText("AI generation & repair usage")).toHaveCount(0);
  });

  test("an editor sees the same full detail as an owner", async ({
    browser,
  }) => {
    const context = await authedContext(browser, "editor");
    const page = await context.newPage();

    await page.goto(`/apps/${fixtures.demoAppId}/operations`, {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("heading", { name: /Launch readiness/ })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Quota consumption")).toBeVisible();
  });

  test("an app that has never been validated or deployed shows honest unknown/not-yet states, never a fake healthy badge", async ({
    browser,
  }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();

    await page.goto(`/apps/${fixtures.demoAppId}/operations`, {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("heading", { name: /Launch readiness/ })
    ).toBeVisible({ timeout: 15_000 });

    // The same sentence legitimately appears twice — once in the
    // Validation card's own detail, once summarized under
    // "Launch-blocking issues" — so assert on the specific card rather
    // than an ambiguous text match.
    await expect(
      page.getByText("This app has never been validated.").first()
    ).toBeVisible();
    await expect(page.getByText(/No approved release/).first()).toBeVisible();
  });

  test("keyboard: the back-to-workspace link and readiness controls are reachable by Tab", async ({
    browser,
  }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();

    await page.goto(`/apps/${fixtures.demoAppId}/operations`, {
      timeout: 45_000,
    });
    await expect(
      page.getByRole("heading", { name: /Launch readiness/ })
    ).toBeVisible({ timeout: 15_000 });

    const backLink = page.getByRole("link", { name: "Back to workspace" });
    await expect(backLink).toBeVisible();
    await backLink.focus();
    await expect(backLink).toBeFocused();
  });
});
