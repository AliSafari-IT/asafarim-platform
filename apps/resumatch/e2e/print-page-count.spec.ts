import type { Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { expect, seedTailoredResume, test } from "./fixtures";

/**
 * No blank trailing page in the CV or cover-letter PDF.
 *
 * The live site printed one extra, empty page after both documents. Any
 * in-flow box after the document did it, however small: it sat on the
 * default page rather than the document's named zero-margin page, and a
 * change of page name forces a break; for the one-page letter, the shell's
 * min-height of 100vh (a full page in print) pushed it over as well. Such
 * boxes come from outside the app (the framework, browser extensions), so
 * each test appends some to <body> before printing, the way the live page
 * gets them. The guard is in app/resumatch.css ("No blank trailing page").
 */

const CV_ID = "e2e-cv-long";
const LETTER_ID = "e2e-cv-letter";

test.beforeEach(async () => {
  await seedTailoredResume(CV_ID, LETTER_ID);
});

/** What ends up after the app's own markup on a live page. */
async function appendStrayNodes(page: Page) {
  await page.evaluate(() => {
    document.body.appendChild(document.createElement("stray-inline-element"));
    const empty = document.createElement("div");
    empty.style.height = "1px";
    document.body.appendChild(empty);
    document
      .querySelector(".ui-shell__main")!
      .appendChild(document.createElement("div"));
  });
}

async function pageTexts(
  page: Page,
  format: "A4" | "Letter"
): Promise<string[]> {
  // displayHeaderFooter mirrors Chrome's default "Headers and footers".
  const pdf = await page.pdf({ format, displayHeaderFooter: true });
  const { text } = await extractText(
    await getDocumentProxy(new Uint8Array(pdf))
  );
  return text;
}

for (const format of ["A4", "Letter"] as const) {
  test(`the cover letter prints on exactly one ${format} page`, async ({
    page,
  }) => {
    await page.goto(`/cover-letter/${LETTER_ID}/preview`);
    await expect(
      page.getByTestId("cover-letter").filter({ visible: true })
    ).toBeVisible();
    await appendStrayNodes(page);
    const pages = await pageTexts(page, format);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("Jordan Example");
  });

  test(`the CV ends on its last line, with no blank ${format} page`, async ({
    page,
  }) => {
    await page.goto(`/tailor/${CV_ID}/preview`);
    await expect(
      page.getByTestId("cv").filter({ visible: true })
    ).toBeVisible();
    await appendStrayNodes(page);
    const pages = await pageTexts(page, format);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (const text of pages) expect(text.trim().length).toBeGreaterThan(20);
    // The last section is on the last page.
    expect(pages.at(-1)).toContain("Dutch (Native)");
  });
}
