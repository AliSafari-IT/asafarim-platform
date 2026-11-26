import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { applicationCard, e2eDb, expect, seedApplications, signInAs, test } from "./fixtures";

/**
 * One-time calendar export (#969, calendar-export.md). The browser runs in
 * Auckland, far from UTC, so an all-day follow-up that slipped through
 * local time would land on another day; interviews are saved in Brussels.
 */
test.use({ timezoneId: "Pacific/Auckland", locale: "en-US" });

const NOW = new Date("2026-11-25T11:00:00Z");
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const TITLE = "Développeur, Full-stack; R&D “Ops”";

test.beforeEach(async ({ page }) => {
  await seedApplications([
    { id: "e2e-cal-none", title: "QA Engineer", status: "SAVED", followUpDate: null },
    { id: "e2e-cal-dated", title: TITLE, status: "APPLIED", followUpDate: day("2026-12-03") },
  ]);
  await page.clock.setFixedTime(NOW);
});

async function text(download: Download): Promise<string> {
  const path = await download.path();
  return readFile(path, "utf8");
}

/** The UTF-8 file name the server gives (RFC 6266 filename*). */
async function dispositionName(url: string, page: Page): Promise<string> {
  const header = (await page.request.get(url)).headers()["content-disposition"] ?? "";
  expect(header).toMatch(/^attachment; filename="[\x20-\x7e]+\.ics"; filename\*=UTF-8''/);
  return decodeURIComponent(header.split("UTF-8''")[1]);
}

/** Unfolded property lines, as a calendar would read them. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

async function addInterview(page: Page, local: string, zone: string) {
  const res = await page.request.post("/api/applications/e2e-cal-dated/events", {
    data: {
      kind: "INTERVIEW",
      occurredAt: { local, timeZone: zone },
      summary: "PRIVATE: salary talk with Sam",
      sender: "sam@example.test",
      clientKey: `e2e-${local.replace(/\W/g, "")}-key`,
    },
  });
  expect(res.status()).toBeLessThan(300);
}

test("a saved follow-up downloads as an all-day event on exactly that day", async ({ page }) => {
  await page.goto("/applications");
  const card = applicationCard(page, TITLE);
  await expect(card.getByTestId("follow-up-calendar-note")).toContainText("one-time .ics download");
  await expect(card.getByTestId("follow-up-calendar-note")).toContainText("reminders depend on your calendar's settings");
  const before = await e2eDb().application.findUniqueOrThrow({ where: { id: "e2e-cal-dated" } });

  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("follow-up-calendar-link").click()]);
  // The UTF-8 name is in filename*; this headless Chromium build can't
  // decode a non-ASCII filename* and reports "download", so read the header.
  expect(download.suggestedFilename()).toMatch(/\.ics$|^download$/);
  expect(await dispositionName("/api/applications/e2e-cal-dated/follow-up/calendar", page)).toBe(`Follow-up – ${TITLE} – Example Employer.ics`);
  const ics = unfold(await text(download));
  expect(ics).toContain("DTSTART;VALUE=DATE:20261203\r\n");
  expect(ics).toContain("DTEND;VALUE=DATE:20261204\r\n");
  expect(ics).toContain("SUMMARY:Follow up: Développeur\\, Full-stack\\; R&D “Ops” at Example Employer\r\n");
  expect(ics).toMatch(/URL:http:\/\/localhost:3012\/applications\/e2e-cal-dated\/timeline\r\n/);
  expect(ics).not.toMatch(/ATTENDEE|ORGANIZER/);

  // Exporting changes nothing.
  const after = await e2eDb().application.findUniqueOrThrow({ where: { id: "e2e-cal-dated" } });
  expect(after.status).toBe(before.status);
  expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  expect(await e2eDb().applicationEvent.count({ where: { applicationId: "e2e-cal-dated" } })).toBe(0);
  expect(await e2eDb().sentApplicationEmail.count({ where: { applicationId: "e2e-cal-dated" } })).toBe(0);
});

test("no date, no export; it appears once a date is saved", async ({ page }) => {
  await page.goto("/applications");
  const card = applicationCard(page, "QA Engineer");
  await expect(card.getByLabel("Follow-up date")).toBeVisible();
  await expect(card.getByTestId("follow-up-calendar")).toHaveCount(0);
  expect((await page.request.get("/api/applications/e2e-cal-none/follow-up/calendar")).status()).toBe(409);

  await card.getByLabel("Follow-up date").fill("2026-12-10");
  await card.getByLabel("Follow-up date").blur();
  await expect(card.getByTestId("follow-up-calendar-link")).toBeVisible();
  const res = await page.request.get("/api/applications/e2e-cal-none/follow-up/calendar");
  expect(res.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  expect(await res.text()).toContain("DTSTART;VALUE=DATE:20261210\r\n");
});

test("an interview downloads at its saved instant, without private details", async ({ page }) => {
  await page.goto("/applications/e2e-cal-dated/timeline");
  await addInterview(page, "2026-11-24T10:00", "Europe/Brussels");
  // After the daylight-saving change in Brussels (25 October).
  await addInterview(page, "2026-10-24T10:00", "Europe/Brussels");
  await page.reload();

  const entries = page.getByTestId("timeline-entry").filter({ has: page.getByTestId("interview-calendar") });
  await expect(entries).toHaveCount(2);
  await expect(entries.first().getByTestId("interview-calendar-note")).toContainText("won't update an event you've already imported");

  const [summer] = await Promise.all([page.waitForEvent("download"), entries.nth(0).getByTestId("interview-calendar-link").click()]);
  const [winter] = await Promise.all([page.waitForEvent("download"), entries.nth(1).getByTestId("interview-calendar-link").click()]);
  const summerIcs = unfold(await text(summer));
  const winterIcs = unfold(await text(winter));
  expect(summerIcs).toContain("DTSTART:20261024T080000Z\r\n");
  expect(winterIcs).toContain("DTSTART:20261124T090000Z\r\n");
  expect(winterIcs).toContain("(Europe/Brussels)");
  expect(winterIcs).not.toContain("DTEND");
  const event = await e2eDb().applicationEvent.findFirstOrThrow({ where: { applicationId: "e2e-cal-dated" } });
  expect(await dispositionName(`/api/applications/e2e-cal-dated/events/${event.id}/calendar`, page)).toBe(`Interview – ${TITLE} – Example Employer.ics`);
  for (const ics of [summerIcs, winterIcs]) {
    expect(ics).not.toContain("PRIVATE");
    expect(ics).not.toContain("sam@example.test");
  }
});

test("another account can't export this application's events", async ({ page, context, baseURL }) => {
  await page.goto("/applications/e2e-cal-dated/timeline");
  await addInterview(page, "2026-11-24T10:00", "Europe/Brussels");
  const event = await e2eDb().applicationEvent.findFirstOrThrow({ where: { applicationId: "e2e-cal-dated" } });
  await signInAs(context, baseURL, "e2e-resumatch-intruder");
  expect((await page.request.get("/api/applications/e2e-cal-dated/follow-up/calendar")).status()).toBe(404);
  expect((await page.request.get(`/api/applications/e2e-cal-dated/events/${event.id}/calendar`)).status()).toBe(404);
  await context.clearCookies();
  expect((await page.request.get("/api/applications/e2e-cal-dated/follow-up/calendar", { maxRedirects: 0 })).status()).not.toBe(200);
});

const shots = process.env.CALENDAR_SHOTS;
const axePath = process.env.AXE_CORE_PATH;

async function checkContrast(page: Page, include: string[], theme: string) {
  if (!axePath) return;
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async (selectors) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run({ include: selectors }, { runOnly: ["wcag2a", "wcag2aa"] });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }, include);
  expect(violations, theme).toEqual([]);
}

test("screenshots and contrast of both actions", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set CALENDAR_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  const project = testInfo.project.name.replace(/\s+/g, "-");
  const setTheme = (theme: string) => page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);

  await page.goto("/applications");
  const card = applicationCard(page, TITLE);
  await expect(card.getByTestId("follow-up-calendar-link")).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    if (shots) await card.locator(".rm-followup").screenshot({ path: `${shots}/follow-up-${project}-${theme}.png` });
    await checkContrast(page, [".rm-followup"], theme);
  }

  await addInterview(page, "2026-11-24T10:00", "Europe/Brussels");
  await page.goto("/applications/e2e-cal-dated/timeline");
  const entry = page.getByTestId("timeline-entry").filter({ has: page.getByTestId("interview-calendar") });
  await expect(entry).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    if (shots) await entry.screenshot({ path: `${shots}/interview-${project}-${theme}.png` });
    await checkContrast(page, [".rm-tl"], theme);
  }
});
