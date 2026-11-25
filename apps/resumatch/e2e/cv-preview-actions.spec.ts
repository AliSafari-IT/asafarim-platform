import { e2eDb, expect, openCvAppearance, seedTailoredResume, test } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * The action area on the tailored CV preview (2026-11-25): a status line
 * ("✓ Saved to applications" + View applications), the main row (Edit CV,
 * Download ▾ with PDF and Word, and Send application as the one filled
 * button), the supporting links (View cover letter with its language badge,
 * Regenerate CV), then "CV appearance" folded away. "Create PDFs" is gone
 * from this page: the composer behind Send application makes the PDFs.
 *
 * PREVIEW_ACTIONS_SHOTS=<dir> also saves light/dark screenshots.
 */

const CV_ID = "e2e-actions-cv";
const LETTER_ID = "e2e-actions-letter";
const shots = process.env.PREVIEW_ACTIONS_SHOTS;

test.beforeEach(async () => {
  await seedTailoredResume(CV_ID, LETTER_ID);
});

async function saveToApplications() {
  const prisma = e2eDb();
  const cv = await prisma.tailoredResume.findUniqueOrThrow({ where: { id: CV_ID } });
  await prisma.application.create({
    data: { workspaceId: cv.workspaceId, targetJobId: cv.targetJobId, tailoredResumeId: CV_ID, status: "SAVED" },
  });
}

const box = async (page: Page, testId: string) => {
  const rect = await page.getByTestId(testId).boundingBox();
  if (!rect) throw new Error(`${testId} has no box`);
  return rect;
};

test("the actions are grouped: status, main row, supporting links, CV appearance", async ({ page }, testInfo) => {
  await saveToApplications();
  await page.goto(`/tailor/${CV_ID}/preview`);
  const actions = page.getByTestId("cv-actions");

  // Status, apart from the buttons, with a text link to the tracker.
  const status = page.getByTestId("save-application-status");
  await expect(status).toContainText("✓");
  await expect(status).toContainText("Saved to applications");
  await expect(status.getByRole("link", { name: "View applications" })).toHaveAttribute("href", "/applications");

  // Main row: Edit CV, Download ▾, Send application. Send is the only filled button.
  const main = page.getByTestId("cv-actions-main");
  await expect(main.getByRole("link", { name: "Edit CV", exact: true })).toBeVisible();
  const download = main.getByRole("button", { name: "Download", exact: true });
  await expect(download).toHaveAttribute("aria-haspopup", "menu");
  await expect(download).toHaveAttribute("aria-expanded", "false");
  const send = main.getByTestId("send-application");
  await expect(send).toHaveText("Send application");
  await expect(send).toHaveClass(/ui-btn--primary/);
  await expect(actions.locator(".ui-btn--primary")).toHaveCount(1);
  // "Create PDFs" made the email's attachments, not a download; the
  // composer does that now, so it is not on this page.
  await expect(page.getByTestId("create-pdfs")).toHaveCount(0);
  await expect(page.getByText("Create PDFs")).toHaveCount(0);

  // Supporting links: the cover letter's language badge sits inside its link.
  const letter = page.getByTestId("view-cover-letter");
  await expect(letter).toHaveAttribute("href", `/cover-letter/${LETTER_ID}/preview`);
  await expect(letter.locator(".rx-pill--lang")).toBeVisible();
  await expect(page.getByTestId("edit-regenerate")).toHaveText("Regenerate CV");

  // CV appearance: closed, saying what the CV shows now.
  const appearance = page.getByTestId("cv-appearance");
  await expect(appearance).not.toHaveAttribute("open", "");
  await expect(appearance.locator("summary")).toContainText("CV appearance");
  await expect(appearance.locator("summary")).toContainText("Grouped by category");
  await expect(page.getByTestId("cv-skills-layout")).toBeHidden();

  // Top to bottom in that order.
  const [s, m, l, a] = [
    await box(page, "save-application-status"),
    await box(page, "cv-actions-main"),
    await box(page, "view-cover-letter"),
    await box(page, "cv-appearance"),
  ];
  expect(s.y).toBeLessThan(m.y);
  expect(m.y + m.height).toBeLessThanOrEqual(l.y);
  expect(l.y).toBeLessThan(a.y);

  // One left edge, the CV's own.
  const cv = (await page.getByTestId("cv").filter({ visible: true }).boundingBox())!;
  for (const left of [s.x, m.x, a.x, (await box(page, "edit-saved")).x]) expect(Math.abs(left - cv.x)).toBeLessThanOrEqual(1);

  // Same height for every main button.
  const heights = [
    (await box(page, "edit-saved")).height,
    (await box(page, "cv-download-button")).height,
    (await box(page, "send-application")).height,
  ];
  expect(new Set(heights).size).toBe(1);

  if (testInfo.project.name === "Mobile Chrome") {
    // The main action comes first and full width; Edit CV and Download share the row below.
    const sendBox = await box(page, "send-application");
    const edit = await box(page, "edit-saved");
    const dl = await box(page, "cv-download-button");
    expect(sendBox.y).toBeLessThan(edit.y);
    expect(Math.abs(edit.y - dl.y)).toBeLessThanOrEqual(1);
    expect(sendBox.width).toBeGreaterThan(m.width - 2);
  } else {
    // Send application on the right of the same row as Edit CV.
    const sendBox = await box(page, "send-application");
    const edit = await box(page, "edit-saved");
    expect(Math.abs(sendBox.y - edit.y)).toBeLessThanOrEqual(1);
    expect(sendBox.x).toBeGreaterThan(edit.x);
  }
  // Nothing on the page scrolls sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Download opens a menu with PDF and Word, by keyboard and by mouse", async ({ page }) => {
  // Count print calls instead of opening the browser's dialog.
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => {
      (window as unknown as { __prints: number }).__prints += 1;
    };
  });
  await page.goto(`/tailor/${CV_ID}/preview`);
  const download = page.getByRole("button", { name: "Download", exact: true });
  const menu = page.getByRole("menu", { name: "Download this CV" });
  const pdf = menu.getByRole("menuitem", { name: /^PDF/ });
  const word = menu.getByRole("menuitem", { name: /^Word \(\.docx\)/ });

  // Keyboard: Arrow Down opens on the first item, arrows wrap, Escape returns focus.
  await download.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  await expect(download).toHaveAttribute("aria-expanded", "true");
  await expect(pdf).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(word).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(pdf).toBeFocused();
  await page.keyboard.press("End");
  await expect(word).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(download).toBeFocused();
  await expect(download).toHaveAttribute("aria-expanded", "false");

  // Enter opens it too; choosing Word downloads the .docx.
  await page.keyboard.press("Enter");
  await expect(pdf).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const [file] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(file.suggestedFilename()).toMatch(/\.docx$/);
  await expect(menu).toBeHidden();

  // Mouse: PDF prints the CV (the browser's print-to-PDF).
  await download.click();
  await pdf.click();
  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);

  // A click outside closes it.
  await download.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { name: "Your tailored CV" }).click();
  await expect(menu).toBeHidden();
});

test("not saved yet: the status line offers Save to applications", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const status = page.getByTestId("save-application-status");
  await expect(status).toContainText("Not in your applications yet.");
  await status.getByTestId("save-application").click();
  // PDFs are made as it saves when the server can (else when the composer opens).
  await expect(status).toContainText("Saved to applications", { timeout: 60_000 });
  await expect(status.getByRole("link", { name: "View applications" })).toBeVisible();
});

test("CV appearance: settings with their notes beneath, Rewrite only for the paragraph", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  await openCvAppearance(page);
  const toggle = page.getByTestId("cv-photo-toggle").or(page.getByRole("link", { name: "Add a photo" }));
  await expect(toggle).toBeVisible();
  const picker = page.getByTestId("cv-skills-layout");
  const note = page.getByTestId("cv-skills-status");
  await expect(note).toContainText("One line per category");
  expect((await note.boundingBox())!.y).toBeGreaterThan((await picker.boundingBox())!.y);
  await expect(page.getByTestId("cv-skills-rewrite")).toHaveCount(0);

  await picker.selectOption("paragraph");
  await expect(page.getByTestId("cv-skills-rewrite")).toBeVisible();
  await expect(page.getByTestId("cv-skills-edit")).toBeVisible();
  // Same height as the select beside them.
  const selectHeight = (await picker.boundingBox())!.height;
  expect((await page.getByTestId("cv-skills-rewrite").boundingBox())!.height).toBe(selectHeight);

  await picker.selectOption("columns");
  await expect(page.getByTestId("cv-skills-rewrite")).toHaveCount(0);

  // Remembered open for this viewer.
  await page.reload();
  await expect(page.getByTestId("cv-appearance")).toHaveAttribute("open", "");
  // Closing it by keyboard.
  await page.getByTestId("cv-appearance").locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cv-appearance")).not.toHaveAttribute("open", "");
});

test("screenshots of the action area", async ({ page }, testInfo) => {
  test.skip(!shots, "set PREVIEW_ACTIONS_SHOTS=<dir> to save screenshots");
  await saveToApplications();
  const project = testInfo.project.name.replace(/\s+/g, "-");
  for (const theme of ["light", "dark"] as const) {
    await page.goto(`/tailor/${CV_ID}/preview`, { waitUntil: "networkidle" });
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    const actions = page.getByTestId("cv-actions");
    await expect(actions).toBeVisible();
    await actions.screenshot({ path: `${shots}/actions-${project}-${theme}.png` });

    await page.getByRole("button", { name: "Download", exact: true }).click();
    await page.getByRole("menu").waitFor();
    await page.screenshot({ path: `${shots}/download-menu-${project}-${theme}.png`, clip: await menuClip(page) });
    await page.keyboard.press("Escape");

    await openCvAppearance(page);
    if ((await page.getByTestId("cv-skills-layout").inputValue()) !== "paragraph") {
      await page.getByTestId("cv-skills-layout").selectOption("paragraph");
      await expect(page.getByTestId("cv-skills-rewrite")).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await page.getByRole("button", { name: "Download", exact: true }).blur();
    await actions.screenshot({ path: `${shots}/appearance-${project}-${theme}.png` });
    // Back to closed for the next theme.
    await page.getByTestId("cv-appearance").locator("summary").click();
  }
});

/** The action area plus the open menu below it. */
async function menuClip(page: Page) {
  const actions = (await page.getByTestId("cv-actions").boundingBox())!;
  const menu = (await page.getByRole("menu").boundingBox())!;
  const bottom = Math.max(actions.y + actions.height, menu.y + menu.height) + 12;
  return { x: actions.x - 8, y: actions.y - 8, width: actions.width + 16, height: bottom - actions.y + 8 };
}
