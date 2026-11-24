import { e2eDb, expect, seedTailoredResume, signInWithEmail, test } from "./fixtures";

/**
 * "Send application" end to end (send-application.md): "Save to
 * applications" makes the PDFs so the card is ready to send; a card saved
 * without PDFs can still be sent (the composer makes them); open the
 * composer (status unchanged), send through the fixture mailer, see Saved
 * become Applied, then read and filter the sent history.
 *
 * Needs the server started with RESUMATCH_EMAIL_TRANSPORT=fixture and
 * RESUMATCH_PDF_CHROMIUM_PATH (the CI job sets both); skipped otherwise.
 * SEND_E2E_SCREENSHOTS=<dir> also saves screenshots of each step.
 */

const CV_ID = "e2e-send-cv";
const LETTER_ID = "e2e-send-letter";
const APP_ID = "e2e-send-app";
const RECRUITER = "jobs@example-audio.test";
const shots = process.env.SEND_E2E_SCREENSHOTS;

test.skip(
  process.env.RESUMATCH_EMAIL_TRANSPORT !== "fixture" || !process.env.RESUMATCH_PDF_CHROMIUM_PATH,
  "needs RESUMATCH_EMAIL_TRANSPORT=fixture and RESUMATCH_PDF_CHROMIUM_PATH",
);

test.beforeEach(async ({ context, baseURL }) => {
  await seedTailoredResume(CV_ID, LETTER_ID);
  const prisma = e2eDb();
  const cv = await prisma.tailoredResume.findUniqueOrThrow({ where: { id: CV_ID } });
  await prisma.targetJob.update({
    where: { id: cv.targetJobId },
    data: { rawText: `Software Developer at Example Audio. Send your CV to ${RECRUITER}. Questions: privacy@example-audio.test` },
  });
  await prisma.application.create({
    data: { id: APP_ID, workspaceId: cv.workspaceId, targetJobId: cv.targetJobId, tailoredResumeId: CV_ID, status: "SAVED" },
  });
  await signInWithEmail(context, baseURL, "jordan@example.test", "Jordan Example");
});

test("Save to applications links the CV and letter, ready to send without Create PDFs", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  // Start from a CV that is not in the tracker yet.
  await e2eDb().application.delete({ where: { id: APP_ID } });

  await page.goto(`/tailor/${CV_ID}/preview`);
  await page.getByTestId("save-application").click();
  const status = page.getByTestId("save-application-status");
  await expect(status).toContainText("ready to send", { timeout: 60_000 });
  if (shots) await page.screenshot({ path: `${shots}/${testInfo.project.name.replace(/\s+/g, "-")}-0-saved-ready.png` });

  const pdfs = await e2eDb().documentPdf.findMany({ where: { OR: [{ tailoredResumeId: CV_ID }, { coverLetterId: LETTER_ID }] } });
  expect(pdfs.map((p) => p.kind).sort()).toEqual(["COVER_LETTER", "CV"]);

  await status.getByRole("link", { name: "View applications" }).click();
  await page.waitForURL("**/applications");
  const entry = page.getByTestId("send-entry").filter({ visible: true }).first();
  await expect(entry).toContainText("The PDFs of the CV and cover letter are ready.");
  await entry.getByTestId("send-application").click();
  await page.waitForURL(/\/applications\/[^/]+\/send$/);
  await expect(page.getByTestId("attachment-cv")).toContainText("Jordan Example – CV – Example Audio.pdf");
  await expect(page.getByTestId("attachment-letter")).toContainText("Cover letter");
  // The PDFs from the save were attached; none were made again.
  expect(await e2eDb().documentPdf.count({ where: { OR: [{ tailoredResumeId: CV_ID }, { coverLetterId: LETTER_ID }] } })).toBe(2);

  // "Create PDFs" stays available as an optional refresh.
  await page.goto("/applications");
  const again = page.getByTestId("send-entry").filter({ visible: true }).first();
  await again.getByTestId("create-pdfs").click();
  await expect(again).toContainText("The PDFs already match the CV and cover letter.", { timeout: 60_000 });
});

test("send the application, and find it in the sent history", async ({ page }, testInfo) => {
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${testInfo.project.name.replace(/\s+/g, "-")}-${name}.png`, fullPage: true });
  };
  test.setTimeout(120_000);

  // Saved before it had PDFs: Send application is offered anyway, and the
  // composer makes the PDFs as it opens.
  await page.goto("/applications");
  const entry = page.getByTestId("send-entry").filter({ visible: true }).first();
  await expect(entry).toContainText("made when you open it");
  await shot("1-card-no-pdfs-yet");
  const send = entry.getByTestId("send-application");
  await expect(send).toBeVisible();

  await send.click();
  await page.waitForURL(`**/applications/${APP_ID}/send`);
  const to = page.getByLabel("To (recipient email)");
  await expect(to).toHaveValue(RECRUITER);
  await expect(page.getByTestId("sender-reply-to")).toContainText("jordan@example.test");
  await expect(page.getByTestId("sender-from")).toContainText("Jordan Example");
  await expect(page.getByTestId("attachment-cv")).toContainText("Jordan Example – CV – Example Audio.pdf", { timeout: 60_000 });
  await expect(page.getByTestId("attachment-letter")).toContainText("Cover letter");
  const subject = page.getByLabel("Subject");
  await expect(subject).not.toHaveValue("", { timeout: 30_000 });
  await shot("3-composer");

  // Opening the composer never changes the status.
  expect((await e2eDb().application.findUniqueOrThrow({ where: { id: APP_ID } })).status).toBe("SAVED");

  await subject.fill("Application: Software Developer (Jordan Example)");
  await page.getByTestId("send-submit").click();
  await expect(page.getByTestId("send-success")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("send-success")).toBeFocused();
  await shot("4-sent");

  const app = await e2eDb().application.findUniqueOrThrow({ where: { id: APP_ID } });
  expect(app.status).toBe("APPLIED");
  expect(app.appliedAt).not.toBeNull();
  const sent = await e2eDb().sentApplicationEmail.findMany({ where: { applicationId: APP_ID } });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ status: "ACCEPTED", subject: "Application: Software Developer (Jordan Example)", contactEmailNormalized: RECRUITER });

  await page.getByTestId("view-sent").click();
  await expect(page.getByTestId("sent-detail")).toContainText(RECRUITER);
  await expect(page.getByTestId("sent-attachment")).toHaveCount(2);
  await shot("5-sent-detail");

  await page.goto("/applications/sent");
  await expect(page.getByTestId("sent-row")).toHaveCount(1);
  await shot("6-sent-list");
  await page.getByTestId("filter-contact").filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/contact=jobs%40example-audio\.test/);
  await expect(page.getByTestId("chip-contact")).toBeVisible();
  await page.getByTestId("filter-company").filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/company=example-audio/);
  await expect(page.getByTestId("chip-company")).toBeVisible();
  await shot("7-sent-filtered");
  await page.getByTestId("clear-filters").click();
  await expect(page).toHaveURL(/\/applications\/sent$/);

  // The card now shows Applied and links to the history.
  await page.goto("/applications");
  await expect(page.getByTestId("last-sent").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId("applied-at").filter({ visible: true }).first()).toBeVisible();
  await shot("8-card-after");
});

test("send one application to up to 3 recipients (#944)", async ({ page }, testInfo) => {
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${testInfo.project.name.replace(/\s+/g, "-")}-multi-${name}.png`, fullPage: true });
  };
  test.setTimeout(120_000);
  await page.goto(`/applications/${APP_ID}/send`);
  await expect(page.getByTestId("attachment-cv")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Subject")).not.toHaveValue("", { timeout: 30_000 });
  await expect(page.getByLabel("To (recipient email)")).toHaveValue(RECRUITER);

  // Up to two more fields, then the link is gone.
  const add = page.getByTestId("add-recipient");
  await add.click();
  await expect(page.getByLabel("To (recipient 2)")).toBeFocused();
  await page.getByLabel("To (recipient 2)").fill("hr@example-audio.test");
  await add.click();
  await page.getByLabel("To (recipient 3)").fill("JOBS@example-audio.test");
  await expect(add).toHaveCount(0);
  await shot("1-three-recipients");

  // The same address twice is refused, under its own field.
  await page.getByTestId("send-submit").click();
  await expect(page.getByText("This address is already a recipient.")).toBeVisible();
  await expect(page.getByLabel("To (recipient 3)")).toBeFocused();
  expect(await e2eDb().sentApplicationEmail.count({ where: { applicationId: APP_ID } })).toBe(0);

  // Remove it, add a different one, and send once.
  await page.getByTestId("remove-recipient").nth(1).click();
  await expect(page.getByTestId("extra-recipient")).toHaveCount(1);
  await add.click();
  await page.getByLabel("To (recipient 3)").fill("lead@example-audio.test");
  await page.getByTestId("send-submit").click();
  await expect(page.getByTestId("send-success")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("send-success")).toContainText("hr@example-audio.test");
  await shot("2-sent");

  const sent = await e2eDb().sentApplicationEmail.findMany({ where: { applicationId: APP_ID } });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ contactEmail: RECRUITER, additionalRecipients: ["hr@example-audio.test", "lead@example-audio.test"] });

  await page.getByTestId("view-sent").click();
  await expect(page.getByTestId("sent-recipients").locator("li")).toHaveCount(3);
  await page.goto("/applications/sent");
  await expect(page.getByTestId("more-recipients").filter({ visible: true }).first()).toContainText("+2");
  await page.goto(`/applications/sent?contact=${encodeURIComponent("lead@example-audio.test")}`);
  await expect(page.getByTestId("sent-row")).toHaveCount(1);
  await shot("3-history");
});

test("a refused send keeps the draft and the status", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/applications");
  const entry = page.getByTestId("send-entry").filter({ visible: true }).first();
  await entry.getByTestId("send-application").click();
  await page.waitForURL(`**/applications/${APP_ID}/send`);
  await expect(page.getByTestId("attachment-cv")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Subject")).not.toHaveValue("", { timeout: 30_000 });

  await page.getByLabel("To (recipient email)").fill("reject@example-audio.test");
  const body = page.getByLabel("Message");
  await body.fill("My own words, kept after a failure.");
  await page.getByTestId("send-submit").click();
  await expect(page.getByText("Your application was not sent.")).toBeVisible({ timeout: 30_000 });
  await expect(body).toHaveValue("My own words, kept after a failure.");
  expect((await e2eDb().application.findUniqueOrThrow({ where: { id: APP_ID } })).status).toBe("SAVED");

  await page.reload();
  await expect(page.getByLabel("Message")).toHaveValue("My own words, kept after a failure.");
});
