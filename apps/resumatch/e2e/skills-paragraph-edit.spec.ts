import { expect, openCvAppearance, seedTailoredResume, test } from "./fixtures";

/**
 * Hand-editing the CV's skills paragraph: "Edit paragraph" opens it in
 * place in the CV's Skills section, Save keeps the candidate's own words on
 * this CV (preview, print and DOCX), and Rewrite asks before it replaces
 * them. Sentences the AI check would not have kept are listed as advice,
 * never removed. The paragraph is first written by the fixture provider.
 */

const CV_ID = "e2e-cv-skills-edit";
const LETTER_ID = "e2e-cv-skills-edit-letter";
const EDITED =
  "Builds typed web interfaces in TypeScript and React, with Node.js services on PostgreSQL. Ships with Docker and keeps releases safe with Playwright tests.";

test.beforeEach(async () => {
  await seedTailoredResume(CV_ID, LETTER_ID);
});

async function writeParagraph(page: import("@playwright/test").Page) {
  await page.goto(`/tailor/${CV_ID}/preview`);
  await openCvAppearance(page);
  await page.getByTestId("cv-skills-layout").selectOption("paragraph");
  await expect(page.getByTestId("cv-skills-edit")).toBeVisible();
}

test("edit the paragraph in place, keep it after a reload, print and export it", async ({ page }) => {
  await writeParagraph(page);
  const cv = page.getByTestId("cv").filter({ visible: true });
  const paragraph = cv.locator('[data-skills-layout="paragraph"]');
  const before = (await paragraph.textContent())?.trim() ?? "";
  expect(before.length).toBeGreaterThan(0);

  await page.getByTestId("cv-skills-edit").click();
  const editor = page.getByTestId("cv-skills-editor");
  const input = page.getByTestId("cv-skills-editor-input");
  await expect(editor).toBeVisible();
  // In place, inside the CV's Skills section, holding the current text.
  await expect(cv.getByTestId("cv-skills-section").getByTestId("cv-skills-editor")).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(before);
  await expect(page.getByTestId("cv-skills-status")).toContainText("Editing the paragraph");
  // Nothing downloads text that is still being changed.
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeDisabled();
  await expect(page.getByTestId("cv-skills-layout")).toBeDisabled();
  await expect(page.getByTestId("cv-skills-rewrite")).toBeDisabled();

  // Line breaks are tidied into one paragraph.
  await input.fill(EDITED.replace(". ", ".\n\n"));
  await page.getByTestId("cv-skills-editor-save").click();
  await expect(editor).toBeHidden();
  await expect(paragraph).toHaveText(EDITED);
  await expect(page.getByTestId("cv-skills-status")).toContainText("now use your edited paragraph");
  await expect(page.getByTestId("cv-skills-edit")).toBeFocused();
  await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
  // Every sentence names listed skills only: no advice.
  await expect(page.getByTestId("cv-skills-advice")).toHaveCount(0);

  await page.reload();
  await expect(paragraph).toHaveText(EDITED);
  await expect(page.getByTestId("cv-skills-status")).toContainText("Edited by you");

  await page.emulateMedia({ media: "print" });
  await expect(paragraph).toHaveText(EDITED);
  await page.emulateMedia({ media: "screen" });

  const docx = await page.request.get(`/api/tailor/${CV_ID}/docx`);
  expect(docx.status()).toBe(200);
});

test("Cancel and Escape keep the saved paragraph; an empty one is refused", async ({ page }) => {
  await writeParagraph(page);
  const cv = page.getByTestId("cv").filter({ visible: true });
  const paragraph = cv.locator('[data-skills-layout="paragraph"]');
  const before = (await paragraph.textContent())?.trim() ?? "";

  await page.getByTestId("cv-skills-edit").click();
  await page.getByTestId("cv-skills-editor-input").fill("Something else entirely.");
  await page.getByTestId("cv-skills-editor-cancel").click();
  await expect(page.getByTestId("cv-skills-editor")).toBeHidden();
  await expect(paragraph).toHaveText(before);
  await expect(page.getByTestId("cv-skills-edit")).toBeFocused();

  await page.getByTestId("cv-skills-edit").click();
  await page.getByTestId("cv-skills-editor-input").fill("   ");
  await page.getByTestId("cv-skills-editor-save").click();
  await expect(page.getByTestId("cv-skills-editor-error")).toContainText("Write the paragraph before saving");
  await expect(page.getByTestId("cv-skills-editor-input")).toHaveAttribute("aria-invalid", "true");
  await page.getByTestId("cv-skills-editor-input").press("Escape");
  await expect(page.getByTestId("cv-skills-editor")).toBeHidden();
  await expect(paragraph).toHaveText(before);

  // The server refuses the same, whatever the client sends.
  const empty = await page.request.put(`/api/tailor/${CV_ID}/skills-paragraph`, { data: { paragraph: " " } });
  expect(empty.status()).toBe(400);
  const long = await page.request.put(`/api/tailor/${CV_ID}/skills-paragraph`, { data: { paragraph: "a".repeat(1501) } });
  expect(long.status()).toBe(400);
});

test("sentences beyond the CV are advice, and Rewrite asks before replacing an edit", async ({ page }) => {
  await writeParagraph(page);
  const cv = page.getByTestId("cv").filter({ visible: true });
  const paragraph = cv.locator('[data-skills-layout="paragraph"]');

  await page.getByTestId("cv-skills-edit").click();
  const extra = "Runs it all on Kubernetes.";
  await page.getByTestId("cv-skills-editor-input").fill(`${EDITED} ${extra}`);
  // Ctrl+Enter saves.
  await page.getByTestId("cv-skills-editor-input").press("Control+Enter");
  await expect(paragraph).toHaveText(`${EDITED} ${extra}`);
  const advice = page.getByTestId("cv-skills-advice");
  await expect(advice).toContainText("Worth a second look");
  await expect(advice.locator("li")).toHaveCount(1);
  await expect(advice.locator("li")).toContainText(extra);
  await expect(advice.locator("li")).toContainText("not in this CV's skills");

  // Keep my edits: nothing is rewritten.
  await page.getByTestId("cv-skills-rewrite").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Replace your edited paragraph?");
  await dialog.getByRole("button", { name: "Keep my edits" }).click();
  await expect(dialog).toBeHidden();
  await expect(paragraph).toHaveText(`${EDITED} ${extra}`);

  // Rewrite: a new AI paragraph, no longer marked as edited.
  await page.getByTestId("cv-skills-rewrite").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Rewrite paragraph" }).click();
  await expect(paragraph).not.toHaveText(`${EDITED} ${extra}`);
  await expect(paragraph).not.toContainText("Kubernetes");
  await expect(advice).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("cv-skills-status")).not.toContainText("Edited by you");
  // A fresh AI paragraph rewrites without asking.
  await page.getByTestId("cv-skills-rewrite").click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("screenshots: editor and advice", async ({ page }, testInfo) => {
  const shots = process.env.RM_SHOTS;
  test.skip(!shots, "Screenshots only when RM_SHOTS names a folder.");
  const project = testInfo.project.name.replace(/\s+/g, "-");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await seedTailoredResume(CV_ID, LETTER_ID);
    await writeParagraph(page);
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.getByTestId("cv-skills-edit").click();
    await page.getByTestId("cv-skills-editor-input").fill(`${EDITED} Runs it all on Kubernetes.`);
    const section = page.getByTestId("cv").filter({ visible: true }).getByTestId("cv-skills-section");
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/editor-${project}-${theme}.png` });
    await page.getByTestId("cv-skills-editor-save").click();
    await expect(page.getByTestId("cv-skills-advice")).toBeVisible();
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.getByTestId("cv-skills-layout").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/advice-${project}-${theme}.png` });
  }
});
