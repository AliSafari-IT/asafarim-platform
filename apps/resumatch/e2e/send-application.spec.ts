import { e2eDb, expect, seedTailoredResume, signInWithEmail, test } from "./fixtures";

/**
 * "Send application" end to end (send-application.md): create the PDFs,
 * open the composer (status unchanged), send through the fixture mailer,
 * see Saved become Applied, then read and filter the sent history.
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

test("create PDFs, send the application, and find it in the sent history", async ({ page }, testInfo) => {
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: `${shots}/${testInfo.project.name.replace(/\s+/g, "-")}-${name}.png`, fullPage: true });
  };
  test.setTimeout(120_000);

  await page.goto("/applications");
  const entry = page.getByTestId("send-entry").filter({ visible: true }).first();
  await expect(entry).toContainText("create PDFs of the CV and cover letter");
  await shot("1-card-needs-pdfs");
  await entry.getByRole("button", { name: "Create PDFs" }).click();
  const send = entry.getByTestId("send-application");
  await expect(send).toBeVisible({ timeout: 60_000 });
  await shot("2-card-ready");

  await send.click();
  await page.waitForURL(`**/applications/${APP_ID}/send`);
  const to = page.getByLabel("To (recipient email)");
  await expect(to).toHaveValue(RECRUITER);
  await expect(page.getByTestId("sender-reply-to")).toContainText("jordan@example.test");
  await expect(page.getByTestId("sender-from")).toContainText("Jordan Example");
  await expect(page.getByTestId("attachment-cv")).toContainText("Jordan Example – CV – Example Audio.pdf");
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

test("a refused send keeps the draft and the status", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/applications");
  const entry = page.getByTestId("send-entry").filter({ visible: true }).first();
  await entry.getByRole("button", { name: "Create PDFs" }).click();
  await entry.getByTestId("send-application").click({ timeout: 60_000 });
  await page.waitForURL(`**/applications/${APP_ID}/send`);
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
