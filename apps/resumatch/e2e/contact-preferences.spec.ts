import { E2E_PLATFORM_USER_ID, e2eDb, expect, seedApplications, seedTailoredResume, signInWithEmail, test } from "./fixtures";

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

test("in an edited message, a new choice asks first and changes only the paragraph", async ({ page }) => {
  test.setTimeout(120_000);
  await saveDefaults();
  const body = await openComposer(page);
  await expect(body).toHaveValue(/reach me by phone/);
  const edited = (await body.inputValue()).replace(/^([^\n]+)/, "$1 (my own greeting)");
  await body.fill(edited);

  const contact = page.getByTestId("composer-contact");
  await contact.getByLabel("Leave them out").check();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Only the contact paragraph changes");
  await dialog.getByRole("button", { name: "Keep my message" }).click();
  await expect(body).toHaveValue(edited);
  await expect(contact).toContainText("Your message was kept as it is.");

  await contact.getByLabel("Use my saved preferences").check();
  await contact.getByLabel("Leave them out").check();
  await page.getByRole("alertdialog").getByRole("button", { name: "Change the paragraph" }).click();
  await expect(body).not.toHaveValue(/reach me/);
  await expect(body).toHaveValue(/\(my own greeting\)/);
});

test("a reopened draft can still leave out its paragraph after the defaults change", async ({ page }) => {
  test.setTimeout(120_000);
  await saveDefaults();
  const body = await openComposer(page);
  await expect(body).toHaveValue(/reach me by phone/);
  await page.getByTestId("save-draft").click();
  await expect.poll(async () => (await e2eDb().applicationEmailDraft.findUnique({ where: { applicationId: APP_ID } }))?.contactParagraph ?? null).toContain("reach me by phone");

  // The saved defaults change, so they no longer render the paragraph in the draft.
  await e2eDb().contactPreferences.updateMany({ data: { content: { callWindows: [], timeZone: "Europe/Brussels", outsideHours: "none", unavailable: [], email: false, whatsapp: true } } });
  await page.reload();
  const reopened = page.getByLabel("Message");
  await expect(reopened).toHaveValue(/reach me by phone/);
  await page.getByTestId("composer-contact").getByLabel("Leave them out").check();
  await expect(reopened).not.toHaveValue(/reach me/);
  await expect(reopened).toHaveValue(/Kind regards,/);
});

test("preferences alone can be erased, and erased values never come back on a later save", async ({ page }) => {
  test.setTimeout(120_000);
  // A workspace holding nothing but contact preferences.
  await seedApplications([]);
  await page.goto("/profile#contact-preferences");
  const panel = page.getByTestId("contact-preferences-panel");
  await panel.getByRole("button", { name: "Add call times" }).click();
  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel).toContainText("Saved.");

  const erase = page.getByRole("button", { name: "Delete my CV and profile" });
  await expect(erase).toBeEnabled();
  await erase.click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await expect(page.getByText("Everything ResuMatch held for you has been deleted.")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => e2eDb().contactPreferences.count({ where: { workspace: { platformUserId: E2E_PLATFORM_USER_ID } } })).toBe(0);

  // The form starts again from nothing: no call times survive.
  await expect(panel.getByTestId("contact-call-windows").locator("fieldset")).toHaveCount(0);
  await panel.getByLabel("WhatsApp").check();
  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel).toContainText("Saved.");
  const stored = await e2eDb().contactPreferences.findFirstOrThrow({ where: { workspace: { platformUserId: E2E_PLATFORM_USER_ID } } });
  expect(stored.content).toMatchObject({ callWindows: [], whatsapp: true });
});
