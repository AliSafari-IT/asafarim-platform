import { test, expect } from "@playwright/test";
import { title } from "./_title";

test.describe("Checkout", () => {
  test(title("checkout-item-count"), async ({ page }) => {
    await page.goto("/?screen=checkout");
    await expect(page.getByTestId("checkout-count")).toHaveText("2 item(s)");
  });

  // Seeded defect `checkout-total-includes-tax`: the correct total is $55.00
  // (subtotal $50.00 + 10% tax). The SUT drops tax and shows $50.00, so this
  // fails deterministically.
  test(title("checkout-total-includes-tax"), async ({ page }) => {
    await page.goto("/?screen=checkout");
    await expect(page.getByTestId("checkout-total")).toHaveText("$55.00", {
      timeout: 2000,
    });
  });
});
