import { expect, seedCoverLetters, test } from "./fixtures";

/**
 * Cover-letter PDF: the print output is the letter alone (no page header,
 * hygiene card, back link or site chrome) and stays on one page for
 * realistic lengths, on both A4 and US Letter. Thresholds for the type
 * size steps are letterDensity() in lib/tailoring/coverLetterLayout.ts.
 */

const SENTENCE =
  "In my current role I build and run production web applications end to end, from the API and data layer to the deployment pipeline, and I document each system so that others can run it.";

/** About `words` words in four paragraphs. */
function paragraphs(words: number): string[] {
  const per = SENTENCE.split(" ").length;
  const sentences = Math.round(words / per);
  const out: string[][] = [[], [], [], []];
  for (let i = 0; i < sentences; i++) out[i % 4]!.push(SENTENCE);
  return out.map((p) => p.join(" "));
}

const LENGTHS = [270, 330, 400];

test.beforeEach(async () => {
  await seedCoverLetters(LENGTHS.map((words) => ({ id: `e2e-letter-${words}`, paragraphs: paragraphs(words) })));
});

test("the letter carries a business-letter frame built from confirmed data", async ({ page }) => {
  await page.goto("/cover-letter/e2e-letter-270/preview");
  const letter = page.getByTestId("cover-letter").filter({ visible: true });
  await expect(letter).toContainText("Jordan Example");
  await expect(letter).toContainText("jordan@example.test · +32 470 00 00 00");
  await expect(letter).toContainText("Ms. Example");
  await expect(letter).toContainText("Example Audio");
  await expect(letter).toContainText("Genk, 20 November 2026");
  await expect(letter).toContainText("Application: Solutions Engineer");
  await expect(page).toHaveTitle("Jordan Example – Cover letter – Example Audio");
});

test("print shows only the letter", async ({ page }) => {
  await page.goto("/cover-letter/e2e-letter-270/preview");
  await page.emulateMedia({ media: "print" });
  for (const text of ["Your cover letter", "Letter hygiene", "Download PDF", "Written in English"]) {
    await expect(page.getByText(text).filter({ visible: true })).toHaveCount(0);
  }
  await expect(page.getByTestId("cover-letter").filter({ visible: true })).toBeVisible();
});

for (const words of LENGTHS) {
  for (const format of ["A4", "Letter"] as const) {
    test(`a ${words}-word letter prints on one ${format} page`, async ({ page }) => {
      await page.goto(`/cover-letter/e2e-letter-${words}/preview`);
      // displayHeaderFooter mirrors Chrome's default "Headers and footers"
      // setting; the letter's zero-margin page leaves them no room.
      const pdf = await page.pdf({ format, displayHeaderFooter: true });
      const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
      expect(pages).toHaveLength(1);
    });
  }
}
