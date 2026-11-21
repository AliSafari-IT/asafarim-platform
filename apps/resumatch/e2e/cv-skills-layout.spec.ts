import { expect, seedTailoredResume, test } from "./fixtures";

/**
 * Skills layout on the tailored CV: grouped by category (the automatic
 * choice for IT skills), compact columns, and a written paragraph from the
 * listed skills (the fixture provider in e2e). The choice is saved on the
 * CV, survives a reload, prints, and reaches the DOCX. The footer names
 * the app and this CV's date.
 */

const CV_ID = "e2e-cv-skills";
const LETTER_ID = "e2e-cv-skills-letter";

test.beforeEach(async () => {
  await seedTailoredResume(CV_ID, LETTER_ID);
});

test("switch the skills layout, keep it after a reload, print and export it", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const cv = page.getByTestId("cv").filter({ visible: true });
  const picker = page.getByTestId("cv-skills-layout");

  await expect(picker).toHaveValue("grouped");
  await expect(cv.locator('[data-skills-layout="grouped"]')).toBeVisible();
  await expect(cv.locator(".rm-resume__skill-category").first()).toHaveText("Languages & Frameworks");

  // The footer names the app and this CV's date, not the year alone.
  const footer = page.getByTestId("footer-meta");
  await expect(footer).toContainText("asafarim-platform | ResuMatch app |");
  await expect(footer.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);

  await picker.selectOption("columns");
  await expect(cv.locator('[data-skills-layout="columns"] li')).toHaveCount(6);
  await page.reload();
  await expect(page.getByTestId("cv-skills-layout")).toHaveValue("columns");

  await page.getByTestId("cv-skills-layout").selectOption("paragraph");
  const paragraph = cv.locator('[data-skills-layout="paragraph"]');
  await expect(paragraph).toBeVisible();
  await expect(paragraph).toContainText("TypeScript");
  await expect(paragraph).toContainText("Playwright");
  await expect(page.getByTestId("cv-skills-rewrite")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(paragraph).toBeVisible();
  await expect(page.getByTestId("cv-skills-layout")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  const docx = await page.request.get(`/api/tailor/${CV_ID}/docx`);
  expect(docx.status()).toBe(200);

  // Back to grouped; the stored paragraph is kept for later.
  await page.getByTestId("cv-skills-layout").selectOption("grouped");
  await expect(cv.locator('[data-skills-layout="grouped"]')).toBeVisible();
  await page.getByTestId("cv-skills-layout").selectOption("paragraph");
  await expect(paragraph).toBeVisible();
});

test("while the paragraph is written, the wait is shown and downloads are paused", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const cv = page.getByTestId("cv").filter({ visible: true });
  const status = page.getByTestId("cv-skills-status");
  const pdf = page.getByRole("button", { name: "Download PDF" });
  const docx = page.getByRole("button", { name: "Download DOCX" });

  // Hold the AI call until the waiting state has been checked.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(`**/api/tailor/${CV_ID}/skills-paragraph`, async (route) => {
    await held;
    await route.continue();
  });

  await page.getByTestId("cv-skills-layout").selectOption("paragraph");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toContainText("Writing your skills paragraph");
  await expect(status).toContainText("downloads are paused");
  await expect(page.getByTestId("cv-skills-layout")).toBeDisabled();
  await expect(pdf).toBeDisabled();
  await expect(docx).toBeDisabled();
  await expect(cv.getByTestId("cv-skills-section")).toHaveAttribute("aria-busy", "true");
  await expect(cv.getByTestId("cv-skills-pending")).toBeVisible();
  // The overlay is never printed.
  await page.emulateMedia({ media: "print" });
  await expect(cv.getByTestId("cv-skills-pending")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  release();
  await expect(cv.locator('[data-skills-layout="paragraph"]')).toBeVisible();
  await expect(cv.getByTestId("cv-skills-pending")).toHaveCount(0);
  await expect(cv.getByTestId("cv-skills-section")).not.toHaveAttribute("aria-busy", "true");
  await expect(status).toContainText("Skills section now shows the written paragraph");
  await expect(pdf).toBeEnabled();
  await expect(docx).toBeEnabled();
  await expect(page.getByTestId("cv-skills-layout")).toBeEnabled();
});

test("a failed paragraph keeps the layout, says so, and can be tried again", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const cv = page.getByTestId("cv").filter({ visible: true });
  let calls = 0;
  await page.route(`**/api/tailor/${CV_ID}/skills-paragraph`, async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 502, json: { error: "The paragraph could not be written.", code: "failed" } });
    } else {
      await route.continue();
    }
  });

  await page.getByTestId("cv-skills-layout").selectOption("paragraph");
  const error = page.getByTestId("cv-skills-error");
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText("so the layout was not changed");
  await expect(page.getByTestId("cv-skills-layout")).toHaveValue("grouped");
  await expect(cv.locator('[data-skills-layout="grouped"]')).toBeVisible();
  await expect(cv.getByTestId("cv-skills-pending")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();

  await page.getByTestId("cv-skills-retry").click();
  await expect(cv.locator('[data-skills-layout="paragraph"]')).toBeVisible();
  await expect(error).toHaveCount(0);
  await expect(page.getByTestId("cv-skills-layout")).toHaveValue("paragraph");
});

test("the paragraph layout can't be chosen through the API before one is written", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const response = await page.request.patch(`/api/tailor/${CV_ID}`, { data: { skillsLayout: "paragraph" } });
  expect(response.status()).toBe(409);
  const bad = await page.request.patch(`/api/tailor/${CV_ID}`, { data: { skillsLayout: "fancy" } });
  expect(bad.status()).toBe(400);
});

test("other pages show the app version in the footer", async ({ page }) => {
  await page.goto("/applications");
  await expect(page.getByTestId("footer-meta")).toHaveText(/^asafarim-platform \| ResuMatch app \| v\d+\.\d+\.\d+$/);
});
