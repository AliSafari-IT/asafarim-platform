import { expect, test } from "@playwright/test";

test.describe("TasksAI M01 smoke", () => {
  test("landing page renders the honest-status disclosure", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TasksAI", level: 1 })).toBeVisible();
    await expect(page.getByText("Early development.")).toBeVisible();
  });

  test("health endpoint reports the service", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.service).toBe("tasks-ai");
    expect(body.checks).toHaveProperty("process", true);
  });

  test("workspace redirects an anonymous visitor to sign in", async ({ page }) => {
    const response = await page.goto("/workspace");
    // Either the proxy 307s to Hub, or the page-level redirect fires.
    expect(page.url()).not.toContain("/workspace");
    expect(response?.status()).toBeLessThan(500);
  });
});
