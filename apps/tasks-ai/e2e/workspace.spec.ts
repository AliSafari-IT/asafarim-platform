import { expect, test } from "@playwright/test";

/**
 * M03 critical journeys. These require an authenticated session and a
 * seeded workspace; they run in the full e2e job (RUN_E2E=1) once auth
 * fixtures land. Kept here so the journey is specified and reviewed.
 */
test.describe("M03 workspace journeys", () => {
  test.skip(!process.env.RUN_E2E, "needs an authenticated session + seed");

  test("create project, capture a task, complete it", async ({ page }) => {
    await page.goto("/workspace");
    await page.getByRole("link", { name: /choose a workspace|create your workspace/i }).first();

    await page.goto("/w/demo/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("Website relaunch");
    await page.getByLabel("Key").fill("WEB");
    await page.getByRole("button", { name: "Create" }).click();

    await page.getByRole("link", { name: /WEB Website relaunch/ }).click();
    await page.getByLabel("Task title").fill("Draft the brief");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Draft the brief")).toBeVisible();

    await page.getByRole("checkbox", { name: "Complete Draft the brief" }).check();
    await expect(page.locator('[data-done="true"]')).toContainText("Draft the brief");
  });

  test("command palette opens with the keyboard and navigates", async ({ page }) => {
    await page.goto("/w/demo/my-work");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await page.getByPlaceholder(/type a command/i).fill("projects");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/w\/demo\/projects/);
  });
});
