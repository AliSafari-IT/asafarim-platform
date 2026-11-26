import type { Page } from "@playwright/test";
import { applicationCard, e2eDb, expect, seedTailoredResume, test } from "./fixtures";

/**
 * Where a saved job came from (job-source.md): the line on application
 * cards and Tailor history, and the saved-job page it links to. Three jobs:
 * a fetched link (with a tailored CV, so it is in history too), a two-file
 * upload and pasted text.
 */
test.use({ locale: "en-US" });

const UPLOAD_TEXT =
  "=== File 1 of 2: vacature-backend.pdf ===\nBackend Developer at Example Logistics\nGenk · Hybrid\n\nYou build our Node.js APIs.\n\n=== File 2 of 2: recruiter-mail.txt ===\nHi! The team would love to talk to you.";

async function seed() {
  await seedTailoredResume("e2e-src-cv", "e2e-src-letter");
  const db = e2eDb();
  const resume = await db.tailoredResume.findUniqueOrThrow({ where: { id: "e2e-src-cv" }, include: { targetJob: true } });
  const workspaceId = resume.workspaceId;
  await db.targetJob.update({
    where: { id: resume.targetJobId },
    data: { rawText: "Software Developer at Example Audio\nWe make speakers.\n\nYou write TypeScript.", fetchedAt: new Date("2026-11-20T09:00:00Z") },
  });
  const files = await db.targetJob.create({
    data: {
      workspaceId,
      sourceUrl: "upload://vacature-backend.pdf (+1 more)",
      sourceFiles: [
        { name: "vacature-backend.pdf", contentType: "application/pdf", bytes: 184_320, characters: 120 },
        { name: "recruiter-mail.txt", contentType: "text/plain", bytes: 912, characters: 40 },
      ],
      rawText: UPLOAD_TEXT,
      title: "Backend Developer",
      employer: "Example Logistics",
      status: "FETCHED",
    },
  });
  const pasted = await db.targetJob.create({
    data: {
      workspaceId,
      sourceUrl: "pasted://job-description",
      rawText: "QA Engineer, Example Bank\n\nYou test our mobile app.",
      title: "QA Engineer",
      employer: "Example Bank",
      status: "FETCHED",
    },
  });
  await db.tailoredResume.create({
    data: {
      workspaceId,
      profileVersionId: resume.profileVersionId,
      targetJobId: files.id,
      templateKey: "classic",
      promptVersion: "e2e",
      modelVersion: "e2e",
      outputLanguage: "en",
      content: resume.content as object,
    },
  });
  const now = Date.now();
  for (const [index, job] of [resume.targetJob, files, pasted].entries()) {
    await db.application.create({
      data: { id: `e2e-src-app-${index}`, workspaceId, targetJobId: job.id, status: "SAVED", createdAt: new Date(now - index * 60_000) },
    });
  }
  return { linkJob: resume.targetJobId, filesJob: files.id, pastedJob: pasted.id };
}

let jobs: Awaited<ReturnType<typeof seed>>;
test.beforeEach(async () => {
  jobs = await seed();
});

test("application cards name the link, the files and pasted text", async ({ page }) => {
  await page.goto("/applications");
  const link = applicationCard(page, "Software Developer").getByTestId("job-source");
  await expect(link).toHaveAttribute("data-kind", "link");
  await expect(link.getByTestId("job-source-kind")).toHaveText("Job link");
  const open = link.getByTestId("job-source-open");
  await expect(open).toHaveAttribute("href", "https://jobs.example.test/software-developer");
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  await expect(open).toContainText("Open job posting (jobs.example.test)");

  const files = applicationCard(page, "Backend Developer").getByTestId("job-source");
  await expect(files.getByTestId("job-source-kind")).toHaveText("Uploaded files");
  await expect(files.getByTestId("job-source-files")).toHaveText("vacature-backend.pdf, recruiter-mail.txt");
  await expect(files.getByTestId("job-source-open")).toHaveCount(0);

  const pasted = applicationCard(page, "QA Engineer").getByTestId("job-source");
  await expect(pasted.getByTestId("job-source-kind")).toHaveText("Pasted text");

  await files.getByTestId("job-source-view").click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobs.filesJob}\\?from=applications$`));
  await expect(page.getByTestId("job-page-kind")).toHaveText("Uploaded files");
  await expect(page.getByTestId("job-page-file")).toHaveCount(2);
  await expect(page.getByTestId("job-page-file").first()).toContainText("vacature-backend.pdf");
  await expect(page.getByTestId("job-page-file").first()).toContainText("PDF · 180 KB");
  await expect(page.getByTestId("job-page-note")).toContainText("not the files themselves");
  const sections = page.getByTestId("job-page-text");
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0).locator("h3")).toHaveText("vacature-backend.pdf");
  await expect(sections.nth(0)).toContainText("You build our Node.js APIs.");
  await expect(sections.nth(1).locator("h3")).toHaveText("recruiter-mail.txt");
  await expect(page.locator("body")).not.toContainText("=== File");
  await page.getByTestId("job-page-back").click();
  await expect(page).toHaveURL(/\/applications$/);
});

test("the timeline page and the link job's saved page", async ({ page }) => {
  await page.goto("/applications/e2e-src-app-0/timeline");
  await expect(page.getByTestId("job-source-kind")).toHaveText("Job link");
  await page.getByTestId("job-source-view").click();
  await expect(page.getByTestId("job-page-open")).toHaveAttribute("href", "https://jobs.example.test/software-developer");
  await expect(page.getByTestId("job-page-text")).toContainText("We make speakers.");
  await expect(page.getByTestId("job-page-note")).toContainText("may have changed");
});

test("Tailor history items show the source and link to the saved job", async ({ page }) => {
  await page.goto("/tailor/history");
  const items = page.locator(".rx-hl__item").filter({ visible: true });
  const linkItem = items.filter({ hasText: "Software Developer" });
  await expect(linkItem.getByTestId("job-source-open")).toHaveAttribute("href", "https://jobs.example.test/software-developer");
  const filesItem = items.filter({ hasText: "Backend Developer" });
  await expect(filesItem.getByTestId("job-source-files")).toHaveText("vacature-backend.pdf, recruiter-mail.txt");
  // A link inside the row's label opens, it does not tick the compare box.
  await filesItem.getByTestId("job-source-view").click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobs.filesJob}\\?from=history$`));
  await expect(page.getByTestId("job-page-back")).toHaveText("Back to history");
});

test("another workspace's job is a 404 and the page escapes the job text", async ({ page }) => {
  const db = e2eDb();
  const other = await db.workspace.create({ data: { platformUserId: "e2e-src-other" } });
  const foreign = await db.targetJob.create({
    data: { workspaceId: other.id, sourceUrl: "pasted://job-description", rawText: "Secret role", title: "Secret", status: "FETCHED" },
  });
  try {
    // notFound(): the dev server can stream it with a 200, so check the page.
    await page.goto(`/jobs/${foreign.id}`);
    await expect(page.getByTestId("job-page-source")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Secret role");
  } finally {
    await db.workspace.delete({ where: { id: other.id } });
  }

  await db.targetJob.update({ where: { id: jobs.pastedJob }, data: { rawText: "<img src=x onerror=alert(1)><b>bold</b>" } });
  await page.goto(`/jobs/${jobs.pastedJob}?from=https://evil.example`);
  await expect(page.getByTestId("job-page-text")).toHaveText("<img src=x onerror=alert(1)><b>bold</b>");
  await expect(page.getByTestId("job-page-text").locator("img, b")).toHaveCount(0);
  await expect(page.getByTestId("job-page-back")).toHaveAttribute("href", "/applications");
});

const shots = process.env.JOB_SOURCE_SHOTS;
const axePath = process.env.AXE_CORE_PATH;

async function checkContrast(page: Page, include: string[], theme: string) {
  if (!axePath) return;
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async (selectors) => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run({ include: selectors }, { runOnly: ["wcag2a", "wcag2aa"] });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  }, include);
  expect(violations, theme).toEqual([]);
}

test("screenshots and contrast of the card line, history and saved-job page", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set JOB_SOURCE_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  const project = testInfo.project.name.replace(/\s+/g, "-");
  const themes = ["light", "dark"] as const;
  // The Next dev overlay badge would sit on top of the shots.
  const setTheme = async (theme: string) => {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  };

  await page.goto("/applications");
  await expect(applicationCard(page, "Backend Developer").getByTestId("job-source")).toBeVisible();
  for (const theme of themes) {
    await setTheme(theme);
    if (shots) {
      await applicationCard(page, "Software Developer").screenshot({ path: `${shots}/card-link-${project}-${theme}.png` });
      await applicationCard(page, "Backend Developer").screenshot({ path: `${shots}/card-files-${project}-${theme}.png` });
    }
    await checkContrast(page, [".rm-job-source"], theme);
  }

  await page.goto("/tailor/history");
  const list = page.locator(".rx-hl__items").filter({ visible: true }).first();
  await expect(list.getByTestId("job-source").first()).toBeVisible();
  for (const theme of themes) {
    await setTheme(theme);
    if (shots) await list.screenshot({ path: `${shots}/history-${project}-${theme}.png` });
    await checkContrast(page, [".rx-hl__source"], theme);
  }

  await page.goto(`/jobs/${jobs.filesJob}?from=applications`);
  await expect(page.getByTestId("job-page-text").first()).toBeVisible();
  for (const theme of themes) {
    await setTheme(theme);
    if (shots) await page.screenshot({ path: `${shots}/job-page-${project}-${theme}.png`, fullPage: true });
    await checkContrast(page, [".rm-job-page__source", ".rm-job-page__text"], theme);
  }
});
