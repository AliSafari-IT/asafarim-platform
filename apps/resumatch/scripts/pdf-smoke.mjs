/**
 * Build-time check that the production image can make PDFs.
 *
 * Run from the standalone output (the Docker runner stage), as the user the
 * server runs as. It loads playwright-core exactly where the server loads
 * it (the traced copy under apps/resumatch/.next/node_modules), launches
 * RESUMATCH_PDF_CHROMIUM_PATH with the server's own flags, and prints one
 * page. A failure fails the image build, instead of every "Create PDFs" in
 * production failing with "The PDFs could not be created".
 *
 * Usage: node apps/resumatch/scripts/pdf-smoke.mjs   (cwd = standalone root)
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const executablePath = process.env.RESUMATCH_PDF_CHROMIUM_PATH?.trim();
if (!executablePath) {
  console.error("pdf-smoke: RESUMATCH_PDF_CHROMIUM_PATH is not set");
  process.exit(1);
}

const tracedDir = path.resolve("apps/resumatch/.next/node_modules");
const entry = readdirSync(tracedDir).find((name) => name === "playwright-core" || name.startsWith("playwright-core-"));
if (!entry) {
  console.error(`pdf-smoke: playwright-core is not in ${tracedDir}`);
  process.exit(1);
}

const { chromium } = await import(pathToFileURL(path.join(tracedDir, entry, "index.mjs")).href);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
try {
  const page = await (await browser.newContext()).newPage();
  await page.setContent("<!doctype html><html><body><h1>ResuMatch PDF check – Ünïcødé</h1></body></html>");
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  if (pdf.length < 500 || pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("not a PDF");
  console.log(`pdf-smoke: ok (Chromium ${browser.version()}, ${pdf.length} bytes)`);
} finally {
  await browser.close();
}
