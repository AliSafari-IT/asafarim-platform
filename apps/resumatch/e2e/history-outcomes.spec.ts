import type { Page } from "@playwright/test";
import { e2eDb, expect, seedTailoredResume, test } from "./fixtures";

/**
 * Application outcomes on Tailor history (0.7.2): each tailored job shows
 * the status it has on /applications, the panel sums them up, and the list
 * filters versions by status. Five jobs: an interview (two versions, the
 * older one used), a rejection, an application waiting 20 days, a saved
 * one and one never tracked; plus an application with no tailored CV.
 */
test.use({ locale: "en-US" });

async function seed() {
  await seedTailoredResume("e2e-oc-cv", "e2e-oc-letter");
  const db = e2eDb();
  const base = await db.tailoredResume.findUniqueOrThrow({ where: { id: "e2e-oc-cv" } });
  const { workspaceId, profileVersionId } = base;
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const job = (title: string, employer: string) =>
    db.targetJob.create({
      data: { workspaceId, sourceUrl: "pasted://job-description", rawText: title, title, employer, status: "FETCHED" },
    });
  const cv = (id: string, targetJobId: string, daysAgo: number) =>
    db.tailoredResume.create({
      data: {
        id,
        workspaceId,
        profileVersionId,
        targetJobId,
        templateKey: "classic",
        promptVersion: "e2e",
        modelVersion: "e2e",
        outputLanguage: "en",
        content: base.content as object,
        createdAt: new Date(now - daysAgo * day),
      },
    });

  // The seeded CV's job (Software Developer · Example Audio) gets an older
  // version too; the older one is the one on the application.
  await db.tailoredResume.update({ where: { id: "e2e-oc-cv" }, data: { createdAt: new Date(now - 1 * day) } });
  await cv("e2e-oc-cv-old", base.targetJobId, 3);
  const rejected = await job("Data Engineer", "Example Bank");
  const waiting = await job("Platform Engineer", "Example Cloud");
  const saved = await job("QA Engineer", "Example Retail");
  const untracked = await job("Solution Architect", "Example Consult");
  await cv("e2e-oc-rejected", rejected.id, 4);
  await cv("e2e-oc-waiting", waiting.id, 22);
  await cv("e2e-oc-saved", saved.id, 2);
  await cv("e2e-oc-untracked", untracked.id, 0);
  const elsewhere = await job("Backend Developer", "Example Elsewhere");

  const app = (id: string, targetJobId: string, status: "SAVED" | "APPLIED" | "INTERVIEWING" | "REJECTED", tailoredResumeId: string | null, appliedDaysAgo: number | null) =>
    db.application.create({
      data: {
        id,
        workspaceId,
        targetJobId,
        tailoredResumeId,
        status,
        appliedAt: appliedDaysAgo === null ? null : new Date(now - appliedDaysAgo * day),
      },
    });
  await app("e2e-oc-app-interview", base.targetJobId, "INTERVIEWING", "e2e-oc-cv-old", 3);
  await app("e2e-oc-app-rejected", rejected.id, "REJECTED", "e2e-oc-rejected", 4);
  await app("e2e-oc-app-waiting", waiting.id, "APPLIED", "e2e-oc-waiting", 20);
  await app("e2e-oc-app-saved", saved.id, "SAVED", "e2e-oc-saved", null);
  await app("e2e-oc-app-elsewhere", elsewhere.id, "APPLIED", null, 5);
}

test.beforeEach(async () => {
  await seed();
});

const panel = (page: Page) => page.getByTestId("history-outcomes").filter({ visible: true });
const versionRow = (page: Page, cvId: string) =>
  page.locator(".rx-hl__item").filter({ visible: true }).filter({ has: page.locator(`a[href="/tailor/${cvId}/preview"]`) });

test("the outcomes panel sums up and links each tailored job", async ({ page }) => {
  await page.goto("/tailor/history");
  const outcomes = panel(page);
  await expect(outcomes.locator(".rx-oc__bar")).toHaveAttribute(
    "aria-label",
    "Interviewing: 1, Applied: 1, Rejected: 1, Saved: 1, Not tracked: 1",
  );
  const insights = outcomes.locator(".rx-oc__insights");
  await expect(insights).toContainText("You applied to 3 of the 5 jobs you tailored a CV for.");
  await expect(insights).toContainText("2 of 3 applications got an answer (67%); interviews or offers: 1.");
  await expect(insights).toContainText("Waiting more than 14 days without an answer: 1.");
  await expect(insights).toContainText("Tailored but not tracked yet: 1.");
  await expect(insights).toContainText("Also tracked without a tailored CV: 1.");

  const jobs = outcomes.locator(".rx-oc__job");
  await expect(jobs).toHaveCount(5);
  const interview = jobs.filter({ hasText: "Example Audio" });
  await expect(interview.locator(".rx-st")).toHaveText("Interviewing");
  await expect(interview).toContainText("Versions: 2");
  await expect(interview.getByRole("link")).toHaveAttribute("href", "/applications/e2e-oc-app-interview/timeline");
  await expect(jobs.filter({ hasText: "Example Cloud" })).toContainText("No answer after 14+ days");
  const notTracked = jobs.filter({ hasText: "Example Consult" });
  await expect(notTracked.locator(".rx-st")).toHaveText("Not tracked");
  await expect(notTracked.getByRole("link", { name: "Track it" })).toHaveAttribute("href", "/tailor/e2e-oc-untracked/preview");
});

test("each version shows its job's status and which one was used", async ({ page }) => {
  await page.goto("/tailor/history");
  await expect(versionRow(page, "e2e-oc-cv-old").locator(".rx-hl__outcome")).toHaveText(/Interviewing.*This version was used/);
  await expect(versionRow(page, "e2e-oc-cv").locator(".rx-hl__outcome")).toHaveText(/Interviewing.*Status of this job/);
  await expect(versionRow(page, "e2e-oc-cv").getByRole("link", { name: "Application" })).toHaveAttribute(
    "href",
    "/applications/e2e-oc-app-interview/timeline",
  );
  await expect(versionRow(page, "e2e-oc-untracked").locator(".rx-st")).toHaveText("Not tracked");
  await expect(versionRow(page, "e2e-oc-untracked").getByRole("link", { name: "Application" })).toHaveCount(0);

  // Filter: only the rejected job's version stays; "All" brings back all six.
  const filters = page.locator(".rx-hl__filters").filter({ visible: true });
  await filters.getByRole("button", { name: /Rejected/ }).click();
  await expect(filters.getByRole("button", { name: /Rejected/ })).toHaveAttribute("aria-pressed", "true");
  const items = page.locator(".rx-hl__item").filter({ visible: true });
  await expect(items).toHaveCount(1);
  await expect(items).toContainText("Data Engineer");
  await filters.getByRole("button", { name: /All/ }).click();
  await expect(items).toHaveCount(6);
});

test("no applications: every job is not tracked and nothing breaks", async ({ page }) => {
  await e2eDb().application.deleteMany({ where: { id: { startsWith: "e2e-oc-app-" } } });
  await page.goto("/tailor/history");
  const insights = panel(page).locator(".rx-oc__insights");
  await expect(insights).toContainText("None of the 5 jobs you tailored for is marked as applied yet.");
  await expect(insights).not.toContainText("got an answer");
  // One status only: the filter row is hidden.
  await expect(page.locator(".rx-hl__filters").filter({ visible: true })).toHaveCount(0);
});

const shots = process.env.HISTORY_OUTCOMES_SHOTS;
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

test("screenshots and contrast of the outcomes panel and list", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set HISTORY_OUTCOMES_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  const project = testInfo.project.name.replace(/\s+/g, "-");
  await page.goto("/tailor/history");
  await expect(panel(page)).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    if (shots) {
      await panel(page).screenshot({ path: `${shots}/outcomes-${project}-${theme}.png` });
      await page.locator(".rx-hl").filter({ visible: true }).screenshot({ path: `${shots}/list-${project}-${theme}.png` });
    }
    await checkContrast(page, [".rx-oc", ".rx-hl__filters", ".rx-hl__outcome"], theme);
  }
});
