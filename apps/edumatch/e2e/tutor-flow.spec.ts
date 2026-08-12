import { test, expect } from "@playwright/test";
import { TUTOR_STORAGE_STATE } from "./global-setup";

/**
 * Tutor dashboard, requests, earnings, and bookings, signed in as the
 * seeded `asafarim+edututor01@gmail.com` (see global-setup.ts).
 *
 * The original version of this file asserted on routes that don't exist
 * (`/tutor/quote-requests`, `/tutor/wallet` — the real routes are
 * `/tutor/requests` and `/tutor/earnings`) and copy that was never in the
 * app ("Wallet", "Cancelled" tab). Rewritten against the live copy in
 * app/tutor/*\/page.tsx and lib/i18n-dictionaries.ts.
 */
test.use({ storageState: TUTOR_STORAGE_STATE });

test.describe("Tutor dashboard", () => {
  test("shows the dashboard with balance and quote-request tiles", async ({
    page,
  }) => {
    await page.goto("/tutor");

    await expect(
      page.getByRole("heading", { name: "Tutor Dashboard" })
    ).toBeVisible();
    await expect(page.getByText("Available Balance")).toBeVisible();
    await expect(page.getByText("Pending Earnings")).toBeVisible();
    // "Quote Requests" also appears in the page subtitle ("...quote
    // requests"), so scope to the stat tile's own heading.
    await expect(
      page.getByRole("heading", { name: "Quote Requests" })
    ).toBeVisible();
  });

  test("quote requests page renders (open list or empty state)", async ({
    page,
  }) => {
    await page.goto("/tutor/requests");

    await expect(
      page.getByRole("heading", { name: "Quote Requests" })
    ).toBeVisible();
  });

  test("earnings page shows balance breakdown", async ({ page }) => {
    await page.goto("/tutor/earnings");

    await expect(page.getByRole("heading", { name: "Earnings" })).toBeVisible();
    await expect(page.getByText("Available Balance")).toBeVisible();
    await expect(page.getByText("Total Earned")).toBeVisible();
    await expect(page.getByText("Transaction History")).toBeVisible();
  });

  test("bookings page renders (grouped list or empty state)", async ({
    page,
  }) => {
    await page.goto("/tutor/bookings");

    await expect(
      page.getByRole("heading", { name: "My Bookings" })
    ).toBeVisible();

    const emptyState = page.getByText("No bookings yet.");
    const anyGroup = page.getByText(/^(Upcoming|Completed|Other) \(\d+\)$/);
    await expect(emptyState.or(anyGroup.first())).toBeVisible();
  });
});
