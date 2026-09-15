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
    // Sub-routes keep parent context visible (issue #369).
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
      "Projects",
    );
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
      "WEB · Website relaunch",
    );
    await page.getByLabel("Task title").fill("Draft the brief");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Draft the brief")).toBeVisible();

    await page.getByRole("checkbox", { name: "Complete Draft the brief" }).check();
    await expect(page.locator('[data-done="true"]')).toContainText("Draft the brief");
  });

  test("workspace navigation is grouped by job, not a flat list (#369)", async ({ page }) => {
    await page.goto("/w/demo");
    const nav = page.getByRole("navigation", { name: "Workspace" });
    for (const group of ["Work", "Planning", "AI & automation", "Insights", "Workspace"]) {
      await expect(nav.getByText(group, { exact: true })).toBeVisible();
    }
    // Descriptions are always available to assistive tech, not hover-only.
    const homeLink = nav.getByRole("link", { name: "Home" }).first();
    const describedbyId = await homeLink.getAttribute("aria-describedby");
    expect(describedbyId).toBeTruthy();
    await expect(page.locator(`#${describedbyId}`)).toHaveText(/workspace entry point/i);
  });

  test("the workspace home explains the product and routes onward (#365)", async ({ page }) => {
    await page.goto("/w/demo");
    await expect(page).toHaveURL(/\/w\/demo$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Other ways to start" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Home" }).first()).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: /import tasks/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^copilot$/i }).first()).toBeVisible();
  });

  test("My Work is an execution surface, not a bare list (#367)", async ({ page }) => {
    await page.goto("/w/demo/my-work");
    await expect(page.getByRole("heading", { level: 1, name: "My Work" })).toBeVisible();
    // The bridge to Focus stays visible in every state: My Work is the list,
    // Focus is the explainable prioritization layer.
    await expect(page.getByRole("link", { name: /open focus/i })).toBeVisible();
    // Wait for the fetch to settle first. Asserting on the copy while the
    // page still says "Loading…" would pass no matter what finally renders,
    // which is exactly the state this test exists to rule out.
    await expect(page.getByText("Loading…")).toHaveCount(0);
    // Either the grouped sections or a guided empty state — never "no tasks
    // match this view".
    await expect(page.locator(".ta-mywork__group, .ui-empty").first()).toBeVisible();
    await expect(page.getByText(/no tasks match/i)).toHaveCount(0);
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
