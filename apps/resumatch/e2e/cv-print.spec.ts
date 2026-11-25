import { extractText, getDocumentProxy } from "unpdf";
import { expect, seedTailoredResume, test } from "./fixtures";

/**
 * Tailored CV PDF: the print output is the CV alone (no page header,
 * language note, toolbar, coverage or quality cards, no site chrome) and
 * the browser's own header and footer get no room on the page. The CV and
 * the paired cover letter carry the profile's links as real anchors.
 */

const CV_ID = "e2e-cv-long";
const LETTER_ID = "e2e-cv-letter";

test.beforeEach(async () => {
  await seedTailoredResume(CV_ID, LETTER_ID);
});

test("print shows only the CV", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  await expect(page).toHaveTitle("Jordan Example – CV – Example Audio");
  await page.emulateMedia({ media: "print" });
  for (const text of ["Your tailored CV", "Download", "Written in English", "View cover letter", "CV appearance"]) {
    await expect(page.getByText(text).filter({ visible: true })).toHaveCount(0);
  }
  await expect(page.getByTestId("cv").filter({ visible: true })).toBeVisible();
  // The CV owns the page margin: the named zero-margin page leaves the
  // browser's header/footer (date, title, URL, page number) no room.
  const padding = await page.getByTestId("cv").filter({ visible: true }).evaluate((el) => getComputedStyle(el).paddingTop);
  expect(parseFloat(padding)).toBeGreaterThan(40);
});

test("the CV shows location, profile links, products and languages", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const cv = page.getByTestId("cv").filter({ visible: true });
  await expect(cv).toContainText("Genk, Belgium");
  await expect(cv.getByRole("link", { name: "linkedin.com/in/jordan-example" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/jordan-example/",
  );
  await expect(cv.getByRole("link", { name: "github.com/jordan-example" })).toBeVisible();
  await expect(cv).toContainText("Projects & products");
  await expect(cv.getByRole("link", { name: "tracker.example.test" })).toBeVisible();
  await expect(cv).toContainText("English (Professional) · Dutch (Native)");
});

for (const format of ["A4", "Letter"] as const) {
  test(`a long CV prints on several clean ${format} pages`, async ({ page }) => {
    await page.goto(`/tailor/${CV_ID}/preview`);
    // Wait for the streamed page, or the PDF is of the loading screen.
    await expect(page.getByTestId("cv").filter({ visible: true })).toBeVisible();
    const pdf = await page.pdf({ format, displayHeaderFooter: true });
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.length).toBeLessThanOrEqual(3);
    // The text is the CV's alone: no browser date, tab title, URL or page number.
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(pdf)), { mergePages: true });
    expect(text).toContain("Jordan Example");
    expect(text).toContain("Software Developer 7");
    expect(text).not.toMatch(/localhost|\/tailor\/|\b1\/\d\b|– CV –/);
  });
}

test("the cover letter header carries the profile links, not products", async ({ page }) => {
  await page.goto(`/cover-letter/${LETTER_ID}/preview`);
  const letter = page.getByTestId("cover-letter").filter({ visible: true });
  await expect(letter.getByRole("link", { name: "linkedin.com/in/jordan-example" })).toBeVisible();
  await expect(letter.getByRole("link", { name: "github.com/jordan-example" })).toBeVisible();
  await expect(letter.getByRole("link", { name: "jordan.example.test" })).toBeVisible();
  await expect(letter).not.toContainText("tracker.example.test");
});
