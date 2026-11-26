import type { Page } from "@playwright/test";
import { applicationCard, e2eDb, expect, seedApplications, signInAs, test } from "./fixtures";

/**
 * External applications and the application timeline
 * (application-timeline.md), the ten scenarios from the request. The
 * browser runs in Brussels with a fixed clock, 25 November 2026 12:00
 * local, so "now" and the default time zone are known.
 */
test.use({ timezoneId: "Europe/Brussels", locale: "en-GB" });

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
  await expect(page.getByTestId("summary-applied-time")).toContainText("20 Nov 2026");
  await expect(page.getByTestId("summary-applied-time")).toContainText("14:30");

  await page.goto("/applications");
  const card = applicationCard(page, "Data Engineer");
  await expect(card.getByTestId("external-channel")).toHaveText("Applied via Indeed");
  await expect(card.getByTestId("external-applied-time")).toContainText("14:30");
  await expect(card.getByTestId("external-applied-time")).toHaveAttribute("datetime", "2026-11-20T13:30:00.000Z");
  await expect(card.locator('[aria-current="step"]')).toContainText("Applied");
  await expect(card.getByTestId("last-sent")).toHaveCount(0);
  await expect(card.getByTestId("mark-external")).toHaveCount(0);
  await expect(card).not.toContainText("Email sent");
  await expect(card.getByTestId("open-application-url")).toHaveAttribute("href", "https://jobs.example.test/e2e-tl-indeed");

  await page.reload();
  await expect(applicationCard(page, "Data Engineer").getByTestId("external-applied-time")).toContainText("14:30");
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
  await expect(page.getByTestId("entry-status-change")).toHaveText("Status: Applied → Interviewing");

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
  await expect(page.locator(".rm-app-summary")).toContainText("of 2");
  await page.goto("/applications?via=indeed");
  await expect(applicationCard(page, "Data Engineer")).toBeVisible();
  await expect(page.locator(".ui-card").filter({ hasText: "QA Engineer" }).filter({ visible: true })).toHaveCount(0);
  await page.goto("/applications?via=email");
  await expect(page.locator(".rm-app-summary")).toContainText("No applications match");
  await page.goto("/applications?sort=applied");
  const titles = await page.locator(".rm-application-list .ui-card").filter({ visible: true }).allTextContents();
  expect(titles.findIndex((t) => t.includes("Data Engineer"))).toBeLessThan(titles.findIndex((t) => t.includes("QA Engineer")));

  // A follow-up added on the timeline is the card's follow-up date.
  await page.goto("/applications/e2e-tl-indeed/timeline?add=1");
  const form = page.getByTestId("event-add-form");
  await form.getByTestId("event-kind").selectOption("FOLLOW_UP");
  await form.getByTestId("event-follow-up").fill("2026-12-02");
  await form.getByTestId("event-save").click();
  await expect(page.getByTestId("summary-follow-up")).toContainText("2 Dec 2026");
  await page.goto("/applications?due=upcoming&today=2026-11-25");
  await expect(applicationCard(page, "Data Engineer")).toBeVisible();
});

test("8: repeated Save clicks record one submission and one update", async ({ page }) => {
  await page.goto("/applications/e2e-tl-indeed/external");
  await page.getByTestId("external-channel-COMPANY_WEBSITE").check();
  const save = page.getByTestId("external-save");
  await Promise.all([save.click(), save.click({ force: true }).catch(() => undefined), save.click({ force: true }).catch(() => undefined)]);
  await expect(page.getByTestId("timeline-flash")).toBeVisible();
  expect((await events("e2e-tl-indeed")).length).toBe(1);

  await page.getByTestId("add-update").click();
  const form = page.getByTestId("event-add-form");
  await form.getByTestId("event-kind").selectOption("NOTE");
  await form.getByTestId("event-summary").fill("Called reception");
  const saveEvent = form.getByTestId("event-save");
  await saveEvent.dblclick();
  await expect(page.getByTestId("timeline-notice")).toHaveText("Update added.");
  expect((await events("e2e-tl-indeed")).map((e) => e.kind)).toEqual(["SUBMITTED", "NOTE"]);
});

test("undo removes only the recorded submission", async ({ page }) => {
  await recordIndeed(page);
  await page.goto("/applications/e2e-tl-indeed/external");
  await page.getByTestId("external-undo").click();
  await page.getByRole("dialog").getByRole("button", { name: "Undo submission" }).click();
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
  const res = await page.goto("/applications/e2e-tl-indeed/timeline");
  expect(res?.status()).toBe(404);
  expect(await e2eDb().applicationEventAttachment.count({ where: { id: file.id } })).toBe(1);
});
