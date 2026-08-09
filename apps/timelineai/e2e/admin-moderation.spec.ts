import { test, expect } from "@playwright/test";
import { signInViaHub } from "./fixtures";

// Spec §16 e2e happy path #2 (admin half): "...an administrator approves
// it." Pairs with e2e/guest-submission.spec.ts, which covers the guest
// half through the real UI.

test("admin can see a pending guest submission and approve it into public visibility", async ({
  browser,
}) => {
  // The guest submission — a fresh, unauthenticated context.
  const guestContext = await browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.60" },
  });
  const guestPage = await guestContext.newPage();
  await guestPage.goto("/create");

  const title = `E2E Admin Moderation ${Date.now()}`;
  await guestPage.getByPlaceholder("e.g. Our company's first year").fill(title);
  await guestPage.getByPlaceholder("What happened?").fill("Submitted by a guest.");
  await guestPage.getByRole("button", { name: /submit for review/i }).click();
  await guestPage.waitForURL(/\/t\//, { timeout: 15_000 });
  const publicUrl = guestPage.url();
  await guestContext.close();

  // The admin — a real Hub-authenticated session.
  const adminContext = await browser.newContext();
  await signInViaHub(adminContext);
  const adminPage = await adminContext.newPage();

  await adminPage.goto("/admin");
  await expect(adminPage.getByText(title)).toBeVisible({ timeout: 15_000 });

  const row = adminPage.locator("li", { hasText: title });
  await expect(row.getByText("pending", { exact: false })).toBeVisible();
  await row.getByRole("button", { name: /^approve$/i }).click();
  await expect(row.getByText("approved", { exact: false })).toBeVisible();
  await adminContext.close();

  // Now anyone can see it.
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const response = await publicPage.goto(publicUrl);
  expect(response?.status()).toBe(200);
  await expect(publicPage.getByText(title)).toBeVisible();
  await publicContext.close();
});
