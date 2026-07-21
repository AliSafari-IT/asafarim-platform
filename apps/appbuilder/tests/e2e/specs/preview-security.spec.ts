import { test, expect } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

test.describe("security — fails closed, never executes unsafe content", () => {
  test("an unknown component variant renders an inline diagnostic, not a crash or blank page", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();

    // Next.js dev mode (Turbopack, uncompiled route) emits its own
    // eval()/CSP console noise unrelated to this page's content — React's
    // dev-only stack-trace reconstruction uses eval(), which a strict CSP
    // (deliberately, for the *actual* generated-app content) also blocks in
    // dev. Neither happens in a production build. Only real, unexpected
    // errors should fail this test.
    const knownDevNoise = [/violates the following Content Security Policy/, /eval\(\) is not supported in this environment/];
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !knownDevNoise.some((pattern) => pattern.test(msg.text()))) {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const response = await page.goto(`/apps/${fixtures.securityAppId}/preview`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Unsupported component")).toBeVisible();
    await expect(page.getByText(/Unknown variant/)).toBeVisible();

    // The rest of the page (chrome, other components) still rendered — one
    // bad component must not take down the whole page.
    await expect(page.locator(".ab-shell")).toBeVisible();
    expect(consoleErrors).toEqual([]);

    await context.close();
  });

  test("unsafe branding content never executes and never renders as raw markup", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();

    let dialogFired = false;
    page.on("dialog", async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    await page.goto(`/apps/${fixtures.securityAppId}/preview`);

    // The literal tag text renders as visible text (React-escaped), never
    // as an actual <b>/<i> element — assert there is no real <b> element
    // carrying this text, only a text node containing the raw markup.
    const boldElementCount = await page.locator("b:has-text('Bold')").count();
    expect(boldElementCount).toBe(0);
    await expect(page.getByText("<b>Bold</b>")).toBeVisible();

    // The javascript: logoUrl must never appear as a live href/src —
    // sanitizeUrl() rejects it, so no <img> should reference it.
    const unsafeImg = await page.locator('img[src^="javascript:"]').count();
    expect(unsafeImg).toBe(0);

    expect(dialogFired).toBe(false);

    await context.close();
  });
});
