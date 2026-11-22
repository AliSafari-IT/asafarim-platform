import { e2eDb, expect, seedTailoredResume, signInWithEmail, test } from "./fixtures";

/**
 * Contact preferences in the application email (#940): saved on the
 * profile, placed in the generated message, left out per email, and never
 * swapped into a message the candidate edited by hand. With nothing saved,
 * the message has no contact paragraph, as before.
 *
 * Needs the server started with RESUMATCH_EMAIL_TRANSPORT=fixture and
 * RESUMATCH_PDF_CHROMIUM_PATH (the CI job sets both); skipped otherwise.
 */

const CV_ID = "e2e-contact-cv";
const LETTER_ID = "e2e-contact-letter";
const APP_ID = "e2e-contact-app";
const COMPOSER = `/applications/${APP_ID}/send`;

const PARAGRAPH =
  "The best time to reach me by phone is Monday to Friday between 09:00 and 17:00, Brussels time. Outside these hours, please arrange a call in advance. You're welcome to send me an email at any time, and I'll respond when available.";

test.skip(
  process.env.RESUMATCH_EMAIL_TRANSPORT !== "fixture" || !process.env.RESUMATCH_PDF_CHROMIUM_PATH,
  "needs RESUMATCH_EMAIL_TRANSPORT=fixture and RESUMATCH_PDF_CHROMIUM_PATH",
);

test.beforeEach(async ({ context, baseURL }) => {
  await seedTailoredResume(CV_ID, LETTER_ID);
  const prisma = e2eDb();
  const cv = await prisma.tailoredResume.findUniqueOrThrow({ where: { id: CV_ID } });
  await prisma.targetJob.update({ where: { id: cv.targetJobId }, data: { rawText: "Software Developer at Example Audio. Send your CV to jobs@example-audio.test." } });
  await prisma.application.create({ data: { id: APP_ID, workspaceId: cv.workspaceId, targetJobId: cv.targetJobId, tailoredResumeId: CV_ID, status: "SAVED" } });
  await signInWithEmail(context, baseURL, "jordan@example.test", "Jordan Example");
});

async function saveDefaults(): Promise<void> {
  const prisma = e2eDb();
  const cv = await prisma.tailoredResume.findUniqueOrThrow({ where: { id: CV_ID } });
  await prisma.contactPreferences.create({
    data: {
      workspaceId: cv.workspaceId,
      content: { callWindows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }], timeZone: "Europe/Brussels", outsideHours: "arrange", unavailable: [], email: true, whatsapp: false },
    },
  });
}

async function openComposer(page: import("@playwright/test").Page) {
  await page.goto(COMPOSER);
  await expect(page.getByTestId("attachment-cv")).toBeVisible({ timeout: 60_000 });
  const body = page.getByLabel("Message");
  await expect(body).not.toHaveValue("", { timeout: 30_000 });
  return body;
}

test("with nothing saved, the message has no contact paragraph", async ({ page }) => {
  test.setTimeout(120_000);
  const body = await openComposer(page);
  await expect(body).not.toHaveValue(/reach me|respond when available/);
  await expect(page.getByTestId("composer-contact")).toContainText("none saved yet");
});

test("save defaults on the profile, see the paragraph, then leave it out", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/profile#contact-preferences");
  const panel = page.getByTestId("contact-preferences-panel");
  await panel.getByRole("button", { name: "Add call times" }).click();
  await panel.getByLabel("Please arrange calls in advance").check();
  await panel.getByLabel("Email", { exact: true }).check();
  await expect(panel.getByTestId("contact-preview")).toHaveText(PARAGRAPH);
  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel).toContainText("Saved.");

  const body = await openComposer(page);
  await expect(body).toHaveValue(new RegExp(`${PARAGRAPH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\nKind regards,`));

  await page.getByTestId("composer-contact").getByLabel("Leave them out").check();
  await expect(body).not.toHaveValue(/reach me/);
  await expect(body).toHaveValue(/Kind regards,/);
});

test("a hand-edited message is never changed by the contact choice", async ({ page }) => {
  test.setTimeout(120_000);
  await saveDefaults();
  const body = await openComposer(page);
  await expect(body).toHaveValue(/reach me by phone/);

  await body.fill("My own words.");
  await page.getByTestId("composer-contact").getByLabel("Leave them out").check();
  await expect(page.getByTestId("composer-contact")).toContainText("You've edited the message");
  await expect(body).toHaveValue("My own words.");
});
