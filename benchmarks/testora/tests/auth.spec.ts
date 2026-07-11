import { test, expect } from "@playwright/test";
import { title } from "./_title";

const VALID_EMAIL = "user@asafarim.test";
const VALID_PASSWORD = "correct-horse";

test.describe("Authentication", () => {
  test(title("auth-valid-login"), async ({ page }) => {
    await page.goto("/?screen=login");
    await page.getByTestId("email").fill(VALID_EMAIL);
    await page.getByTestId("password").fill(VALID_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("session-badge")).toBeVisible();
  });

  test(title("auth-reject-bad-password"), async ({ page }) => {
    await page.goto("/?screen=login");
    await page.getByTestId("email").fill(VALID_EMAIL);
    await page.getByTestId("password").fill("wrong-password");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page.getByTestId("session-badge")).toHaveCount(0);
  });

  // Seeded defect `auth-trim-email`: this asserts correct behaviour (a trailing
  // space should be trimmed and the user logged in). The SUT does not trim, so
  // this fails deterministically — the regression the benchmark must detect.
  test(title("auth-trim-email"), async ({ page }) => {
    await page.goto("/?screen=login");
    await page.getByTestId("email").fill(`${VALID_EMAIL} `);
    await page.getByTestId("password").fill(VALID_PASSWORD);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("session-badge")).toBeVisible({
      timeout: 2000,
    });
  });
});
