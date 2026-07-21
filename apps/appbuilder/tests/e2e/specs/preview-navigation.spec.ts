import { test, expect } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

test.describe("base route + navigation", () => {
  test("the base preview route resolves the specification's homepage (dashboard)", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    // The dashboard's top-level widgets (@asafarim/appbuilder-schema
    // `dashboard.widgets`), not just the (empty) page.components list.
    await expect(page.locator(".ui-metric")).toHaveCount(2);
    await expect(page.locator(".ab-chart")).toBeVisible();
    await context.close();
  });

  test("preview navigation reaches projects, tasks, and team", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview`);

    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(new RegExp(`/apps/${fixtures.demoAppId}/preview/projects$`));
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.locator(".ab-page-components table")).toBeVisible();
    await expect(page.locator(".ab-page-components form")).toBeVisible();

    await page.getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(new RegExp(`/apps/${fixtures.demoAppId}/preview/tasks$`));
    await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
    await expect(page.locator("dl.ab-detail")).toBeVisible();

    await page.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(new RegExp(`/apps/${fixtures.demoAppId}/preview/team$`));
    await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();

    await context.close();
  });

  test("refresh preserves the pinned preview version (deep link is stable)", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview/projects`);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await context.close();
  });

  test("an unknown internal page renders the generated-app not-found state, not a builder error", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.goto(`/apps/${fixtures.demoAppId}/preview/this-page-does-not-exist`);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByText("doesn't exist in AppBuilder")).toBeVisible();
    await context.close();
  });
});
