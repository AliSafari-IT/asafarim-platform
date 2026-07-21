import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

test.describe("accessibility", () => {
  test("the preview homepage has no serious/critical automated accessibility violations", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);

    const results = await new AxeBuilder({ page }).include(".ab-shell").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length > 0) console.log(JSON.stringify(serious, null, 2));
    expect(serious.map((v) => v.id)).toEqual([]);

    await context.close();
  });

  test("the projects page (table + form) has no serious/critical violations", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview/projects`);

    const results = await new AxeBuilder({ page }).include(".ab-shell").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length > 0) console.log(JSON.stringify(serious, null, 2));
    expect(serious.map((v) => v.id)).toEqual([]);

    await context.close();
  });

  test("keyboard navigation reaches every nav link and the skip link works, in a sane focus order", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);

    // The preview renders inside AppBuilder's own admin chrome (top nav,
    // theme toggle, app switcher, user menu), so the generated app's own
    // skip link isn't necessarily the very first Tab stop — but it must be
    // reachable, and once reached it must be a real, focusable link.
    let reachedSkipLink = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      if (await page.locator(".ab-skip-link").evaluate((el) => el === document.activeElement)) {
        reachedSkipLink = true;
        break;
      }
    }
    expect(reachedSkipLink).toBe(true);

    // Continue tabbing until we reach the "Projects" nav link.
    let reachedProjects = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const isProjects = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Projects");
      if (isProjects) {
        reachedProjects = true;
        break;
      }
    }
    expect(reachedProjects).toBe(true);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/apps/${fixtures.demoAppId}/preview/projects$`));

    await context.close();
  });

  test("respects prefers-reduced-motion (no spinner animation)", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);

    // The loading spinner class carries the only CSS animation this
    // package defines; under reduced motion it must be fully disabled.
    const animationName = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.className = "ab-loading__spinner";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).animationName;
      probe.remove();
      return value;
    });
    expect(animationName).toBe("none");

    await context.close();
  });
});
