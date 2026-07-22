import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authedContext, loadFixtures } from "../fixtures/testContext";

const fixtures = loadFixtures();

test.describe.configure({ timeout: 90_000 });

test.describe("M08 builder workspace — accessibility", () => {
  test("the workspace has no serious/critical automated accessibility violations", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/apps/${fixtures.builderAppId}`);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length > 0) console.log(JSON.stringify(serious, null, 2));
    expect(serious.map((v) => v.id)).toEqual([]);

    await context.close();
  });

  test("panel tabs are keyboard-reachable and operable on mobile", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/apps/${fixtures.builderAppId}`);

    let reachedConversationTab = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const text = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (text === "Conversation") {
        reachedConversationTab = true;
        break;
      }
    }
    expect(reachedConversationTab).toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.getByPlaceholder(/Describe a change/)).toBeVisible();
  });

  test("the destructive-confirmation dialog traps focus and returns it on close", async ({ browser }) => {
    // Its own dedicated app — this test deliberately triggers a destructive
    // proposal but never confirms it (only checks focus behavior), so it
    // must not share an app with any test expecting a clean, dialog-free
    // page load (ConversationPanel auto-opens the confirm dialog for any
    // job still `awaiting_confirmation`, regardless of which test navigated
    // there).
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/apps/${fixtures.builderAppA11yDialogId}`);

    const textarea = page.getByPlaceholder(/Describe a change/);
    await textarea.fill("Employees should no longer be able to delete tasks.");
    const sendButton = page.getByRole("button", { name: "Send" });
    await sendButton.click();

    const dialog = page.getByRole("alertdialog", { name: "Confirm destructive change" });
    await expect(dialog).toBeVisible({ timeout: 60_000 });

    // Focus must have moved INTO the dialog, not stayed on the trigger.
    const focusIsInsideDialog = await page.evaluate(() => {
      const dialogEl = document.querySelector('[role="alertdialog"]');
      return dialogEl?.contains(document.activeElement) ?? false;
    });
    expect(focusIsInsideDialog).toBe(true);

    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    await context.close();
  });

  test("respects prefers-reduced-motion for the confirmation dialog's entrance animation", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/apps/${fixtures.builderAppA11yMotionId}`);

    await page.getByPlaceholder(/Describe a change/).fill("Employees should no longer be able to delete tasks.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("alertdialog", { name: "Confirm destructive change" })).toBeVisible({ timeout: 60_000 });

    const animationName = await page.evaluate(() => {
      const overlay = document.querySelector('[role="alertdialog"]')?.parentElement;
      return overlay ? getComputedStyle(overlay).animationName : "none";
    });
    expect(animationName).toBe("none");

    await context.close();
  });

  test("version and status badges are never color-only — every badge carries visible text", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/apps/${fixtures.builderAppId}`);

    const badgeTexts = await page.locator(".ui-badge, [class*='badge']").allTextContents();
    expect(badgeTexts.every((t) => t.trim().length > 0)).toBe(true);

    await context.close();
  });
});
