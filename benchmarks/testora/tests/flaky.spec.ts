import { test, expect } from "@playwright/test";
import { title } from "./_title";

test.describe("Dashboard", () => {
  // Controlled flake `dashboard-widget-loads`: the SUT only mounts the widget
  // when ?attempt > 0. Passing testInfo.retry as the attempt makes the first
  // run (retry 0) fail and the automatic retry (retry 1) pass — a deterministic
  // fail-then-pass signature. Requires `retries: 1` in playwright.config.ts.
  test(title("dashboard-widget-loads"), async ({ page }, testInfo) => {
    await page.goto(`/?screen=dashboard&attempt=${testInfo.retry}`);
    await page.getByTestId("load-widget").click();
    await expect(page.getByTestId("dashboard-widget")).toBeVisible({
      timeout: 2000,
    });
  });
});
