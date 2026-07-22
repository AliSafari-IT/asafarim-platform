import { test, expect } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of ["", "/projects", "/board", "/schedule", "/team"]) {
      await page.goto(`/apps/${fixtures.demoAppId}/preview${path}`);
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(hasOverflow, `horizontal overflow on ${path || "/"} at ${viewport.width}px`).toBe(false);
    }

    await context.close();
  });
}
