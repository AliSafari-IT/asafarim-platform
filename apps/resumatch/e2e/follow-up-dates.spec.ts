import { applicationCard, expect, seedApplications, storedFollowUp, test } from "./fixtures";

/**
 * Follow-up dates on /applications (issue #896). The day is stored as UTC
 * midnight and "today" is the browser's own day, so these run in a fixed
 * zone with a fixed clock: 19 November 2026, 13:00 in Los Angeles
 * (21:00 UTC).
 */
const NOW = new Date("2026-11-19T21:00:00Z");
const day = (value: string) => new Date(`${value}T00:00:00Z`);

test.use({ timezoneId: "America/Los_Angeles", locale: "en-US" });

test.beforeEach(async ({ page }) => {
  await seedApplications([
    { id: "e2e-none", title: "QA Engineer", status: "SAVED", followUpDate: null },
    { id: "e2e-offer", title: "Product Manager", status: "OFFER", followUpDate: day("2026-11-01") },
    { id: "e2e-upcoming", title: "Frontend Developer", status: "SAVED", followUpDate: day("2026-12-01") },
    // A legacy timestamp row (not UTC midnight): reads as its UTC day.
    { id: "e2e-today", title: "Data Analyst", status: "INTERVIEWING", followUpDate: new Date("2026-11-19T15:00:00Z") },
    { id: "e2e-overdue", title: "Backend Engineer", status: "APPLIED", followUpDate: day("2026-11-10") },
  ]);
  await page.clock.setFixedTime(NOW);
});

async function open(page: import("@playwright/test").Page) {
  await page.goto("/applications");
  // The badge appears once the browser's day is known (after hydration).
  await expect(applicationCard(page, "Backend Engineer").locator(".ui-badge")).toBeVisible();
}

const dateInput = (page: import("@playwright/test").Page, title: string) =>
  applicationCard(page, title).getByLabel("Follow-up date");

test("shows overdue, today and upcoming, and no badge for an offer", async ({ page }) => {
  await open(page);
  await expect(applicationCard(page, "Backend Engineer").locator(".ui-badge")).toHaveText("Overdue");
  await expect(applicationCard(page, "Data Analyst").locator(".ui-badge")).toHaveText("Due today");
  await expect(applicationCard(page, "Data Analyst").locator("time")).toHaveText("Nov 19, 2026");
  await expect(applicationCard(page, "Frontend Developer").locator(".ui-badge")).toHaveText("Upcoming");
  await expect(applicationCard(page, "Product Manager").locator(".ui-badge")).toHaveCount(0);
  await expect(applicationCard(page, "Product Manager").locator("time")).toHaveText("Nov 1, 2026");
  await expect(applicationCard(page, "QA Engineer").locator("time")).toHaveCount(0);
});

test.describe("on the other side of UTC", () => {
  // Already 20 November in Kiritimati (UTC+14): the 19 November follow-up
  // is overdue there, while the stored day itself is unchanged.
  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("today is the browser's day", async ({ page }) => {
    await open(page);
    await expect(applicationCard(page, "Data Analyst").locator(".ui-badge")).toHaveText("Overdue");
    await expect(dateInput(page, "Data Analyst")).toHaveValue("2026-11-19");
  });
});

test("set, change and clear persist across a reload", async ({ page }) => {
  await open(page);

  await dateInput(page, "QA Engineer").fill("2026-12-05");
  await dateInput(page, "QA Engineer").blur();
  await expect(applicationCard(page, "QA Engineer").getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await dateInput(page, "Frontend Developer").fill("2027-01-01");
  await dateInput(page, "Frontend Developer").press("Enter");
  await expect(applicationCard(page, "Frontend Developer").getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await applicationCard(page, "Backend Engineer").getByRole("button", { name: "Clear" }).click();
  await expect(applicationCard(page, "Backend Engineer").getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await page.reload();
  await expect(dateInput(page, "QA Engineer")).toHaveValue("2026-12-05");
  await expect(applicationCard(page, "QA Engineer").locator(".ui-badge")).toHaveText("Upcoming");
  await expect(dateInput(page, "Frontend Developer")).toHaveValue("2027-01-01");
  await expect(dateInput(page, "Backend Engineer")).toHaveValue("");
  await expect(applicationCard(page, "Backend Engineer").locator(".ui-badge")).toHaveCount(0);

  // The selected day round-trips unchanged: stored as that day's UTC midnight.
  expect(await storedFollowUp("e2e-none")).toBe("2026-12-05T00:00:00.000Z");
  expect(await storedFollowUp("e2e-upcoming")).toBe("2027-01-01T00:00:00.000Z");
  expect(await storedFollowUp("e2e-overdue")).toBeNull();
});

test("a date typed with the keyboard is saved once complete", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones enter dates through the native picker, which fill() stands in for above.");
  await open(page);
  const input = dateInput(page, "QA Engineer");
  await input.focus();
  // Month, day, year segments, as a person types them (en-US order).
  await page.keyboard.type("12052026", { delay: 30 });
  await page.keyboard.press("Enter");
  await expect(applicationCard(page, "QA Engineer").getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(await storedFollowUp("e2e-none")).toBe("2026-12-05T00:00:00.000Z");
});

test("a half-typed date is not sent as a clear", async ({ page, isMobile }) => {
  test.skip(isMobile, "Needs keyboard editing of the date segments.");
  await open(page);
  const input = dateInput(page, "Frontend Developer");
  await input.focus();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Tab");
  await expect(applicationCard(page, "Frontend Developer")).toContainText("Enter a complete date");
  await page.reload();
  await expect(dateInput(page, "Frontend Developer")).toHaveValue("2026-12-01");
  expect(await storedFollowUp("e2e-upcoming")).toBe("2026-12-01T00:00:00.000Z");
});

test("a failed save keeps the attempted date, and Retry saves it", async ({ page }) => {
  await open(page);
  await page.route("**/api/applications/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Could not save the change."}' })
      : route.continue(),
  );
  const card = applicationCard(page, "Frontend Developer");
  await dateInput(page, "Frontend Developer").fill("2027-02-14");
  await dateInput(page, "Frontend Developer").blur();

  await expect(card.getByRole("alert").or(card.locator(".ui-alert"))).toContainText("The follow-up date was not saved");
  await expect(dateInput(page, "Frontend Developer")).toHaveValue("2027-02-14");
  await expect(dateInput(page, "Frontend Developer")).toHaveAttribute("aria-invalid", "true");
  // The badge still describes what is saved.
  await expect(card.locator("time")).toHaveText("Dec 1, 2026");
  expect(await storedFollowUp("e2e-upcoming")).toBe("2026-12-01T00:00:00.000Z");

  await page.unroute("**/api/applications/*");
  await card.getByRole("button", { name: "Retry" }).click();
  await expect(card.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(card.locator(".ui-alert")).toHaveCount(0);
  await expect(card.locator("time")).toHaveText("Feb 14, 2027");
  expect(await storedFollowUp("e2e-upcoming")).toBe("2027-02-14T00:00:00.000Z");
});

test("closing keeps the date without urgency; reopening restores it", async ({ page }) => {
  await open(page);
  const card = applicationCard(page, "Product Manager");
  await expect(card.locator(".ui-badge")).toHaveCount(0);

  await card.getByRole("button", { name: /Interviewing/ }).click();
  await expect(card.locator(".ui-badge")).toHaveText("Overdue");

  await card.getByRole("button", { name: /Offer/ }).click();
  await expect(card.getByRole("button", { name: /Offer/ })).toHaveAttribute("aria-current", "step");
  await expect(card.locator(".ui-badge")).toHaveCount(0);
  await expect(card.locator("time")).toHaveText("Nov 1, 2026");
  expect(await storedFollowUp("e2e-offer")).toBe("2026-11-01T00:00:00.000Z");
});

test("the page does not scroll sideways", async ({ page }) => {
  await open(page);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});
