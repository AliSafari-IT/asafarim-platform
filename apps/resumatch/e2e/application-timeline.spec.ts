import type { Page } from "@playwright/test";
import { applicationCard, e2eDb, expect, seedApplications, signInAs, test } from "./fixtures";

/**
 * External applications and the application timeline
 * (application-timeline.md), the ten scenarios from the request. The
 * browser runs in Brussels with a fixed clock, 25 November 2026 12:00
 * local, so "now" and the default time zone are known.
 */
test.use({ timezoneId: "Europe/Brussels", locale: "en-US" });

const NOW = new Date("2026-11-25T11:00:00Z");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const EML = Buffer.from(
  "From: Talent <talent@acme.example>\r\nTo: me@example.com\r\nSubject: We received your application\r\nDate: Fri, 20 Nov 2026 14:35:00 +0100\r\nContent-Type: text/html\r\n\r\n<p>Thanks for applying.</p><script>alert('x')</script><img src=https://track.example/p.gif>",
);

test.beforeEach(async ({ page }) => {
  await seedApplications([
    { id: "e2e-tl-other", title: "QA Engineer", status: "SAVED", followUpDate: null },
    { id: "e2e-tl-indeed", title: "Data Engineer", status: "SAVED", followUpDate: null },
  ]);
  await page.clock.setFixedTime(NOW);
});

async function recordIndeed(page: Page, options: { files?: { name: string; mimeType: string; buffer: Buffer }[]; confirmation?: string } = {}) {
  await page.goto("/applications");
  const card = applicationCard(page, "Data Engineer");
  await expect(card.getByTestId("send-entry")).toBeVisible();
  await card.getByTestId("mark-external").click();
  await expect(page.getByTestId("external-form")).toBeVisible();
  await expect(page.getByTestId("external-applied-zone")).toHaveValue("Europe/Brussels");
  await expect(page.getByTestId("external-applied-local")).toHaveValue("2026-11-25T12:00");
  await expect(page.getByTestId("external-url")).toHaveValue("https://jobs.example.test/e2e-tl-indeed");
  await page.getByTestId("external-applied-local").fill("2026-11-20T14:30");
  await page.getByTestId("external-channel-INDEED").check();
  await page.getByTestId("external-reference").fill("IND-4471");
  if (options.confirmation) await page.getByTestId("external-confirmation-text").fill(options.confirmation);
  if (options.files) await page.getByTestId("external-files-input").setInputFiles(options.files);
  await page.getByTestId("external-save").click();
  await expect(page.getByTestId("timeline-flash")).toContainText("Recorded as applied");
}

const events = (applicationId: string) => e2eDb().applicationEvent.findMany({ where: { applicationId }, orderBy: { occurredAt: "asc" } });

test("1 + 2: records an Indeed application with no email or PDFs, and the past time survives a reload", async ({ page }) => {
  await recordIndeed(page);
  await expect(page.getByTestId("summary-status")).toHaveText("Applied");
  await expect(page.getByTestId("summary-channel")).toHaveText("Indeed");
  await expect(page.getByTestId("summary-applied-time")).toContainText("Nov 20, 2026");
  await expect(page.getByTestId("summary-applied-time")).toContainText("02:30 PM");

  await page.goto("/applications");
  const card = applicationCard(page, "Data Engineer");
  await expect(card.getByTestId("external-channel")).toHaveText("Applied via Indeed");
  await expect(card.getByTestId("external-applied-time")).toContainText("02:30 PM");
  await expect(card.getByTestId("external-applied-time")).toHaveAttribute("datetime", "2026-11-20T13:30:00.000Z");
  await expect(card.locator('[aria-current="step"]')).toContainText("Applied");
  await expect(card.getByTestId("last-sent")).toHaveCount(0);
  await expect(card.getByTestId("mark-external")).toHaveCount(0);
  await expect(card).not.toContainText("Email sent");
  await expect(card.getByTestId("open-application-url")).toHaveAttribute("href", "https://jobs.example.test/e2e-tl-indeed");

  await page.reload();
  await expect(applicationCard(page, "Data Engineer").getByTestId("external-applied-time")).toContainText("02:30 PM");
  const row = await e2eDb().application.findUniqueOrThrow({ where: { id: "e2e-tl-indeed" } });
  expect(row.appliedAt?.toISOString()).toBe("2026-11-20T13:30:00.000Z");
  expect(row.appliedTimeZone).toBe("Europe/Brussels");
  expect(await e2eDb().sentApplicationEmail.count({ where: { applicationId: "e2e-tl-indeed" } })).toBe(0);
});

test("3: a confirmation screenshot attached while recording, and a saved email added later", async ({ page }) => {
  await recordIndeed(page, { confirmation: "Thank you for applying!", files: [{ name: "confirmation.png", mimeType: "image/png", buffer: PNG }] });
  const confirmation = page.getByTestId("timeline-entry").filter({ hasText: "Confirmation received" });
  await expect(confirmation.getByTestId("entry-attachment")).toHaveCount(1);
  await expect(confirmation.getByTestId("entry-summary")).toHaveText("Thank you for applying!");
  await expect(page.getByTestId("summary-status")).toHaveText("Applied");

  await confirmation.getByTestId("entry-add-files").click();
  await confirmation.getByTestId("entry-files-input").setInputFiles([{ name: "reply.eml", mimeType: "message/rfc822", buffer: EML }]);
  await confirmation.getByTestId("entry-files-save").click();
  await expect(page.getByTestId("timeline-notice")).toHaveText("Files added.");
  const refreshed = page.getByTestId("timeline-entry").filter({ hasText: "Confirmation received" });
  await expect(refreshed.getByTestId("entry-attachment")).toHaveCount(2);
  const preview = refreshed.getByTestId("eml-preview");
  await preview.locator("summary").click();
  await expect(preview.getByTestId("eml-text")).toHaveText("Thanks for applying.");
  // Shown as text: nothing from the email became markup on the page.
  await expect(refreshed.locator("script, img[src*='track.example']")).toHaveCount(0);

  const image = refreshed.locator('[data-attachment-kind="IMAGE"] [data-testid="attachment-open"]');
  const response = await page.request.get((await image.getAttribute("href"))!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("4 + 5: replies and interviews stay separate entries; a confirmation alone keeps Applied", async ({ page }) => {
  await recordIndeed(page);
  async function add(kind: string, local: string, summary: string, status?: string) {
    await page.getByTestId("add-update").click();
    const form = page.getByTestId("event-add-form");
    await form.getByTestId("event-kind").selectOption(kind);
    await form.getByTestId("event-at-local").fill(local);
    await form.getByTestId("event-summary").fill(summary);
    if (status) await form.getByTestId("event-status-change").selectOption(status);
    await form.getByTestId("event-save").click();
    await expect(page.getByTestId("timeline-notice")).toHaveText("Update added.");
  }
  await add("CONFIRMATION_RECEIVED", "2026-11-20T14:35", "Automatic confirmation");
  await expect(page.getByTestId("summary-status")).toHaveText("Applied");
  await add("RECRUITER_REPLY", "2026-11-22T09:10", "Could you do a call on Tuesday?");
  await add("RESPONSE_SENT", "2026-11-22T10:00", "Tuesday 10:00 works.");
  await add("INTERVIEW", "2026-11-24T10:00", "First interview with the team lead", "INTERVIEWING");
  await expect(page.getByTestId("summary-status")).toHaveText("Interviewing");

  const kinds = await page.getByTestId("timeline-entry").evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
  expect(kinds).toEqual(["SUBMITTED", "CONFIRMATION_RECEIVED", "RECRUITER_REPLY", "RESPONSE_SENT", "INTERVIEW"]);
  await expect(page.getByTestId("timeline-entry").filter({ hasText: "Could you do a call on Tuesday?" })).toHaveCount(1);
  await expect(page.getByTestId("entry-status-change")).toHaveText(["Status: Saved → Applied", "Status: Applied → Interviewing"]);

  await page.goto("/applications");
  await expect(applicationCard(page, "Data Engineer").getByTestId("latest-activity")).toContainText("Latest activity: interview");
  await expect(applicationCard(page, "Data Engineer").getByTestId("card-view-timeline")).toHaveText("View timeline (5)");
});

test("6: editing submission details keeps a later stage", async ({ page }) => {
  await recordIndeed(page);
  await e2eDb().application.update({ where: { id: "e2e-tl-indeed" }, data: { status: "INTERVIEWING" } });
  await page.goto("/applications/e2e-tl-indeed/external");
  await expect(page.getByTestId("external-applied-local")).toHaveValue("2026-11-20T14:30");
  await page.getByTestId("external-channel-LINKEDIN").check();
  await page.getByTestId("external-applied-local").fill("2026-11-19T08:05");
  await page.getByTestId("external-save").click();
  await expect(page.getByTestId("timeline-flash")).toContainText("not moved back");
  await expect(page.getByTestId("summary-status")).toHaveText("Interviewing");
  await expect(page.getByTestId("summary-channel")).toHaveText("LinkedIn");
  const row = await e2eDb().application.findUniqueOrThrow({ where: { id: "e2e-tl-indeed" } });
  expect(row.status).toBe("INTERVIEWING");
  expect(row.appliedAt?.toISOString()).toBe("2026-11-19T07:05:00.000Z");
});

test("7: external applications count in totals, filters, sorting and follow-ups", async ({ page }) => {
  await recordIndeed(page);
  await page.goto("/applications?status=APPLIED");
  await expect(applicationCard(page, "Data Engineer")).toBeVisible();
  await expect(page.locator(".rm-app-summary")).toContainText("of 1 matching");
  await page.goto("/applications?via=indeed");
  await expect(applicationCard(page, "Data Engineer")).toBeVisible();
  await expect(page.locator(".ui-card").filter({ hasText: "QA Engineer" }).filter({ visible: true })).toHaveCount(0);
  await page.goto("/applications?via=email");
  await expect(page.locator(".rm-app-summary")).toContainText("No applications match");
  await page.goto("/applications?sort=applied");
  await expect(applicationCard(page, "QA Engineer")).toBeVisible();
  const titles = await page.locator(".ui-card").filter({ hasText: "Engineer" }).filter({ visible: true }).allTextContents();
  expect(titles.length).toBe(2);
  expect(titles.findIndex((t) => t.includes("Data Engineer"))).toBeLessThan(titles.findIndex((t) => t.includes("QA Engineer")));

  // A follow-up added on the timeline is the card's follow-up date.
  await page.goto("/applications/e2e-tl-indeed/timeline?add=1");
  const form = page.getByTestId("event-add-form");
  await form.getByTestId("event-kind").selectOption("FOLLOW_UP");
  await form.getByTestId("event-follow-up").fill("2026-12-02");
  await form.getByTestId("event-save").click();
  await expect(page.getByTestId("summary-follow-up")).toContainText("Dec 2, 2026");
  await page.goto("/applications?due=upcoming&today=2026-11-25");
  await expect(applicationCard(page, "Data Engineer")).toBeVisible();
});

test("8: repeated Save clicks record one submission and one update", async ({ page }) => {
  await page.goto("/applications/e2e-tl-indeed/external");
  await page.getByTestId("external-channel-COMPANY_WEBSITE").check();
  // Three clicks in the same tick, before React can disable the button:
  // the server must still record one submission.
  await page.getByTestId("external-save").evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.getByTestId("timeline-flash")).toBeVisible();
  expect((await events("e2e-tl-indeed")).length).toBe(1);

  await page.getByTestId("add-update").click();
  const form = page.getByTestId("event-add-form");
  await form.getByTestId("event-kind").selectOption("NOTE");
  await form.getByTestId("event-summary").fill("Called reception");
  await form.getByTestId("event-save").evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByTestId("timeline-notice")).toHaveText("Update added.");
  expect((await events("e2e-tl-indeed")).map((e) => e.kind)).toEqual(["SUBMITTED", "NOTE"]);
});

test("undo removes only the recorded submission", async ({ page }) => {
  await recordIndeed(page);
  await page.goto("/applications/e2e-tl-indeed/external");
  await page.getByTestId("external-undo").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo submission" }).click();
  await expect(page.getByTestId("timeline-flash")).toContainText("undone");
  await expect(page.getByTestId("summary-status")).toHaveText("Saved");
  await expect(page.getByTestId("timeline-empty")).toBeVisible();
  expect(await e2eDb().targetJob.count({ where: { applications: { some: { id: "e2e-tl-indeed" } } } })).toBe(1);
});

test("the email form links to recording an external application", async ({ page }) => {
  await page.goto("/applications/e2e-tl-indeed/send");
  await page.getByTestId("record-external-shortcut").getByRole("link", { name: "Record it here." }).click();
  await expect(page.getByTestId("external-form")).toBeVisible();
  const row = await e2eDb().application.findUniqueOrThrow({ where: { id: "e2e-tl-indeed" } });
  expect(row.status).toBe("SAVED");
});

test("10: another account can't open this timeline or its files", async ({ page, context, baseURL }) => {
  await recordIndeed(page, { files: [{ name: "confirmation.png", mimeType: "image/png", buffer: PNG }] });
  const file = await e2eDb().applicationEventAttachment.findFirstOrThrow({ where: { event: { applicationId: "e2e-tl-indeed" } } });
  await signInAs(context, baseURL, "e2e-resumatch-intruder");
  expect((await page.request.get(`/api/application-attachments/${file.id}`)).status()).toBe(404);
  expect((await page.request.get("/api/applications/e2e-tl-indeed/events")).status()).toBe(404);
  expect((await page.request.delete(`/api/application-attachments/${file.id}`)).status()).toBe(404);
  // The page streams, so a not-found can answer 200 in development; what
  // matters is that none of the application is shown.
  await page.goto("/applications/e2e-tl-indeed/timeline");
  await expect(page.getByTestId("timeline-list")).toHaveCount(0);
  await expect(page.getByTestId("submission-summary")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Data Engineer");
  expect(await e2eDb().applicationEventAttachment.count({ where: { id: file.id } })).toBe(1);
});

const shots = process.env.TIMELINE_SHOTS;
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

test("screenshots and contrast of the form, card and timeline", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set TIMELINE_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  const project = testInfo.project.name.replace(/\s+/g, "-");
  const themes = ["light", "dark"] as const;
  const setTheme = (theme: string) => page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);

  await page.goto("/applications/e2e-tl-indeed/external");
  await page.getByTestId("external-applied-local").fill("2026-11-20T14:30");
  await page.getByTestId("external-channel-INDEED").check();
  await page.getByTestId("external-reference").fill("IND-4471");
  await page.getByTestId("external-confirmation-text").fill("Thank you for applying to Data Engineer at Example Employer.");
  await page.getByTestId("external-files-input").setInputFiles([{ name: "confirmation.png", mimeType: "image/png", buffer: PNG }]);
  for (const theme of themes) {
    await setTheme(theme);
    if (shots) await page.getByTestId("external-form").screenshot({ path: `${shots}/form-${project}-${theme}.png` });
    await checkContrast(page, [".rm-tl-form"], theme);
  }
  await page.getByTestId("external-save").click();
  await expect(page.getByTestId("timeline-flash")).toBeVisible();

  await page.getByTestId("add-update").click();
  const form = page.getByTestId("event-add-form");
  await form.getByTestId("event-kind").selectOption("RECRUITER_REPLY");
  await form.getByTestId("event-at-local").fill("2026-11-22T09:10");
  await form.getByTestId("event-sender").fill("Sam, Example Employer");
  await form.getByTestId("event-summary").fill("Hi! Could you do a short call on Tuesday at 10:00?");
  await form.getByTestId("event-next-action").fill("Confirm Tuesday call");
  await form.getByTestId("event-follow-up").fill("2026-11-30");
  await form.getByTestId("event-save").click();
  await expect(page.getByTestId("timeline-notice")).toHaveText("Update added.");
  await page.getByTestId("add-update").click();
  for (const theme of themes) {
    await setTheme(theme);
    if (shots) {
      await page.getByTestId("event-add-form").screenshot({ path: `${shots}/add-update-${project}-${theme}.png` });
      await page.getByTestId("submission-summary").screenshot({ path: `${shots}/summary-${project}-${theme}.png` });
      await page.getByTestId("timeline-list").screenshot({ path: `${shots}/timeline-${project}-${theme}.png` });
    }
    await checkContrast(page, [".rm-tl", ".rm-tl-summary"], theme);
  }

  await page.goto("/applications");
  const card = applicationCard(page, "Data Engineer");
  await expect(card.getByTestId("external-submission")).toBeVisible();
  for (const theme of themes) {
    await setTheme(theme);
    if (shots) await card.screenshot({ path: `${shots}/card-${project}-${theme}.png` });
    await checkContrast(page, [".rm-app-send"], theme);
  }
});
