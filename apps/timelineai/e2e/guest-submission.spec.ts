import { test, expect } from "@playwright/test";

// Spec §16 e2e happy path #2: "A guest submits a timeline and an
// administrator approves it." This spec covers the guest half end-to-end
// through the real UI; e2e/admin-moderation.spec.ts covers the admin half
// (it needs a real Hub-authenticated session, set up separately there).

test.describe("guest submission", () => {
  test.use({
    // A guest is identified by a hashed request IP (see
    // lib/server/guest.ts) — the trusted-proxy hop configured in
    // playwright.config.ts's webServer.env means this header is honored.
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.50" },
  });

  test("guest can create, gets told it needs review, and only they can see it pending", async ({ page, browser }) => {
    await page.goto("/create");

    // The guest banner must be visible and explain the approval
    // requirement in plain language (spec §4).
    await expect(page.getByText(/reviewed by an admin/i)).toBeVisible();

    await page.getByPlaceholder("e.g. Our company's first year").fill("E2E Guest Timeline");
    await page.getByPlaceholder("What happened?").fill("The one event in this test.");

    await page.getByRole("button", { name: /submit for review/i }).click();

    // Redirects to the public share page once created.
    await page.waitForURL(/\/t\//, { timeout: 15_000 });
    await expect(page.getByText(/awaiting admin review/i)).toBeVisible();
    await expect(page.getByText("E2E Guest Timeline")).toBeVisible();

    const publicUrl = page.url();

    // A second, unrelated visitor (different IP, fresh browser context —
    // no cookies/headers carried over) must NOT be able to see it.
    const strangerContext = await browser.newContext({
      extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.99" },
    });
    const strangerPage = await strangerContext.newPage();
    const response = await strangerPage.goto(publicUrl);
    expect(response?.status()).toBe(404);
    await strangerContext.close();
  });
});
