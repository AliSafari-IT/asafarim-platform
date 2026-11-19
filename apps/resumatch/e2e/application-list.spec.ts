import type { Page } from "@playwright/test";
import { applicationCard, e2eDb, expect, seedApplications, seedManyApplications, test, type BulkApplication } from "./fixtures";

/**
 * Search, filters and pagination on /applications (issue #897). The clock
 * is fixed at 19 November 2026, 21:00 UTC, and the browser runs in
 * Kiritimati (UTC+14), where it is already 20 November: due filters must
 * use that day, not the server's.
 */
const NOW = new Date("2026-11-19T21:00:00Z");
const BROWSER_TODAY = "2026-11-20";
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const STATUSES = ["SAVED", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED"] as const;
const EMPLOYERS = ["Acme", "Globex", "Initech", "Umbrella", "Wayne"];

test.use({ timezoneId: "Pacific/Kiritimati", locale: "en-US" });

/** 240 applications, all created at the same instant. Row i: employer
 *  i % 5, status (i / 5) % 5, follow-up 18, 20 or 22 November or none. */
function bulk(): BulkApplication[] {
  const followUps = [day("2026-11-18"), day(BROWSER_TODAY), day("2026-11-22"), null];
  return Array.from({ length: 240 }, (_, i) => ({
    title: `Role ${String(i).padStart(3, "0")}`,
    employer: EMPLOYERS[i % 5],
    status: STATUSES[Math.floor(i / 5) % 5],
    followUpDate: followUps[i % 4],
  }));
}

const summary = (page: Page) => page.locator(".rm-app-summary").filter({ visible: true });
const cardTitles = (page: Page) =>
  page.locator(".rm-application-list .ui-card > h3").filter({ visible: true }).allInnerTexts();

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("pages through hundreds of rows with equal timestamps, without repeats or gaps", async ({ page }) => {
  await seedManyApplications(bulk());
  await page.goto("/applications");
  await expect(summary(page)).toHaveText("Showing 1–20 of 240");

  const seen: string[] = [];
  for (let n = 1; n <= 12; n++) {
    await expect(page.getByText(`Page ${n} of 12`)).toBeVisible();
    const titles = await cardTitles(page);
    expect(titles).toHaveLength(20);
    seen.push(...titles);
    if (n < 12) await page.getByRole("link", { name: "Next" }).click();
  }
  await expect(page.getByRole("link", { name: "Next" })).toHaveCount(0);
  expect(new Set(seen).size).toBe(240);

  // Back returns to the previous page; reload keeps the page.
  await page.goBack();
  await expect(page).toHaveURL(/page=11/);
  await page.reload();
  await expect(page.getByText("Page 11 of 12")).toBeVisible();
});

test("search, status and due filters combine, live in the URL, and reset", async ({ page }) => {
  await seedManyApplications(bulk());
  await page.goto("/applications?page=3");

  // Keyboard only: type, Enter submits, and the page goes back to 1.
  const search = page.getByRole("searchbox", { name: "Search job title or employer" });
  await search.fill("acme");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/applications\?q=acme$/);
  await expect(summary(page)).toHaveText("Showing 1–20 of 48 matching (240 in total)");

  await page.locator("select[name=status]").selectOption("APPLIED");
  await page.locator("select[name=due]").selectOption("today");
  await page.getByRole("button", { name: "Apply" }).click();
  // The due filter carries the browser's day (Kiritimati), not the server's.
  await expect(page).toHaveURL(`/applications?q=acme&status=APPLIED&due=today&today=${BROWSER_TODAY}`);
  // Acme rows are i % 5 == 0; APPLIED is (i / 5) % 5 == 1; today is i % 4 == 1.
  const expected = Array.from({ length: 240 }, (_, i) => i).filter(
    (i) => i % 5 === 0 && Math.floor(i / 5) % 5 === 1 && i % 4 === 1,
  );
  await expect(summary(page)).toHaveText(`Showing 1–${expected.length} of ${expected.length} matching (240 in total)`);
  for (const title of await cardTitles(page)) {
    await expect(applicationCard(page, title).locator(".ui-badge")).toHaveText("Due today");
  }

  // Reload and back keep the controls.
  await page.reload();
  await expect(search).toHaveValue("acme");
  await expect(page.locator("select[name=due]")).toHaveValue("today");
  await page.goBack();
  await expect(page).toHaveURL(/\/applications\?q=acme$/);
  await expect(page.locator("select[name=status]")).toHaveValue("");
  await expect(page.locator("select[name=due]")).toHaveValue("");

  await page.getByRole("link", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(summary(page)).toHaveText("Showing 1–20 of 240");
});

test("a due filter without the browser's day, or with a stale one, is brought up to date", async ({ page }) => {
  await seedManyApplications(bulk());
  await page.goto("/applications?due=overdue");
  await expect(page).toHaveURL(`/applications?due=overdue&today=${BROWSER_TODAY}`);
  await page.goto("/applications?due=overdue&today=2020-01-01");
  await expect(page).toHaveURL(`/applications?due=overdue&today=${BROWSER_TODAY}`);
  // Overdue: 18 November (i % 4 == 0), open statuses only.
  const expected = Array.from({ length: 240 }, (_, i) => i).filter(
    (i) => i % 4 === 0 && !["OFFER", "REJECTED"].includes(STATUSES[Math.floor(i / 5) % 5]),
  ).length;
  await expect(summary(page)).toContainText(`of ${expected} matching`);
});

test("no matches is not an empty tracker, and notes are not searched", async ({ page }) => {
  await seedApplications([{ id: "e2e-one", title: "Data Analyst", status: "SAVED", followUpDate: null }]);
  await e2eDb().application.update({ where: { id: "e2e-one" }, data: { notes: "zzz-nothing lives only in the notes" } });
  await page.goto("/applications?q=zzz-nothing");
  await expect(summary(page)).toHaveText("No applications match.");
  await page.getByRole("link", { name: "Clear search and filters" }).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(applicationCard(page, "Data Analyst")).toBeVisible();

  await seedApplications([]);
  await page.goto("/applications?q=anything");
  await expect(page.getByText("Nothing tracked yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("search")).toHaveCount(0);
});

test("an edit that moves a row out of the filter updates the list and the count", async ({ page }) => {
  await seedApplications([
    { id: "e2e-a", title: "Backend Engineer", status: "SAVED", followUpDate: null },
    { id: "e2e-b", title: "Frontend Developer", status: "SAVED", followUpDate: null },
    { id: "e2e-c", title: "QA Engineer", status: "APPLIED", followUpDate: null },
  ]);
  await page.goto("/applications?status=SAVED");
  await expect(summary(page)).toHaveText("Showing 1–2 of 2 matching (3 in total)");
  await applicationCard(page, "Backend Engineer").getByRole("button", { name: "Applied" }).click();
  await expect(summary(page)).toHaveText("Showing 1–1 of 1 matching (3 in total)");
  await expect(applicationCard(page, "Backend Engineer")).toHaveCount(0);
});

test("malformed parameters fall back to defaults on the page and are 400s on the API", async ({ page }) => {
  await seedManyApplications(bulk());
  await page.goto("/applications?page=abc&pageSize=9999&status=HIRED&sort=random");
  await expect(summary(page)).toHaveText("Showing 1–20 of 240");

  const ok = await page.request.get("/api/applications?pageSize=100");
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body).toMatchObject({ total: 240, pageSize: 100, pageCount: 3 });
  expect(body.applications).toHaveLength(100);

  const bad = await page.request.get("/api/applications?pageSize=101&due=today");
  expect(bad.status()).toBe(400);
  expect((await bad.json()).invalid.sort()).toEqual(["pageSize", "today"]);
});
