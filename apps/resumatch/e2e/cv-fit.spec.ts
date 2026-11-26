import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #973 on the saved CV's preview (/tailor/[id]/preview), desktop and phone.
 * The old "N% of your skills matched" coverage panel is gone. A CV made
 * after "Analyze job fit" shows that same assessment (same id, method and
 * score) on every reopen, without a provider call; an answer given later
 * does not change it. Legacy, keyword-only and deleted-assessment CVs say
 * "not analyzed for this version" with a way to analyze, in every
 * supported language. Fixture AI provider: no real AI call. Screenshots
 * and axe contrast run when CV_FIT_SHOTS and/or AXE_CORE_PATH are set.
 */

test.use({ locale: "en-US" });

const JOB_TEXT = `Full-stack ontwikkelaar
Je wordt lid van een team van tot 12 leden en werkt samen met elke collega aan oplossingen voor onze klanten.
Vereisten:
- Ervaring met React en TypeScript
- Ervaring met Kubernetes in productie
- Vlot Nederlands
- Kennis van GraphQL`;

const PROFILE = {
  fullName: "Jordan Example",
  email: "jordan@example.test",
  headline: "Full-stack developer · React · TypeScript",
  summary: "Full-stack developer building web applications with React and TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "Playwright", "MATLAB", "Fortran", "ArcGIS", "QGIS", "SPSS", "LaTeX", "HEC-RAS", "Excel"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary: "Develops features in React and TypeScript. Writes end-to-end tests with Playwright.",
    },
  ],
};

const CV_CONTENT = {
  contractVersion: "1.0.0",
  fullName: "Jordan Example",
  email: "jordan@example.test",
  headline: "Full-stack developer",
  summary: "Full-stack developer building web applications with React and TypeScript.",
  skills: PROFILE.skills.map((s) => s.name),
  experience: [{ title: "Full-stack developer", employer: "Example Software", startedOn: "2020-01", endedOn: null, isCurrent: true, bullets: ["Builds React and TypeScript features."] }],
  education: [],
  certifications: [],
  languages: [],
};

let ids = { workspaceId: "", versionId: "", jobId: "" };

test.beforeEach(async () => {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  const job = await prisma.targetJob.create({
    data: { workspaceId: workspace.id, sourceUrl: "manual:", rawText: JOB_TEXT, title: "Full-stack ontwikkelaar", employer: "Voorbeeld BV", status: "FETCHED" },
  });
  ids = { workspaceId: workspace.id, versionId: version.id, jobId: job.id };
});

/** A saved CV on the seeded job; `fit` is its run's recorded fit, or no
 *  context at all for a CV saved before 0.6.0. */
type RecordedFit = { source: "ai" | "keyword"; assessmentId: string | null; rubricVersion: string; gaps: string[] };

async function seedCv(id: string, fit: RecordedFit | "no-context") {
  await e2eDb().tailoredResume.create({
    data: {
      id,
      workspaceId: ids.workspaceId,
      profileVersionId: ids.versionId,
      targetJobId: ids.jobId,
      templateKey: "classic",
      promptVersion: "e2e",
      modelVersion: "e2e",
      outputLanguage: "en",
      content: CV_CONTENT,
      tailoringContext:
        fit === "no-context"
          ? undefined
          : {
              version: "tailoring_context@1",
              workspaceId: ids.workspaceId,
              profileVersionId: ids.versionId,
              targetJobId: ids.jobId,
              jobTextFingerprint: "e2e",
              fit,
            },
    },
  });
}

const OLD_PANEL = /% of your skills matched|Coverage of this posting|Not covered/;

test("analyze, generate, preview, reopen: the same assessment, no new call, later answers do not change it", async ({ page }) => {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  const panel = page.getByTestId("fit-assessment");
  await expect(panel).toHaveAttribute("data-method", "keyword", { timeout: 30_000 });
  await panel.getByRole("button", { name: "Analyze job fit" }).click();
  await expect(panel).toHaveAttribute("data-method", "ai", { timeout: 30_000 });
  const gate = page.getByTestId("fit-gate");
  if (await gate.isVisible()) await gate.getByRole("button", { name: "Yes, tailor my CV anyway" }).click();

  const db = e2eDb();
  const assessment = await db.jobFitAssessment.findFirstOrThrow({ where: { workspaceId: ids.workspaceId } });
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/, { timeout: 30_000 });

  const fit = page.getByTestId("cv-fit");
  await expect(fit).toHaveAttribute("data-state", "recorded");
  await expect(fit.getByTestId("fit-method")).toHaveAttribute("data-assessment-id", assessment.id);
  await expect(fit.getByTestId("fit-method")).toContainText("AI analysis");
  await expect(page.locator("body")).not.toContainText(OLD_PANEL);
  // Boilerplate words of the posting are never listed as gaps.
  for (const word of ["collega", "leden", "oplossingen"]) await expect(fit.getByTestId("fit-gaps")).not.toContainText(word);
  const match = await fit.getByTestId("fit-match").textContent();
  const usage = await db.aiUsageLedger.count({ where: { workspaceId: ids.workspaceId } });

  // Reopening costs nothing and shows the same assessment and score.
  await page.reload();
  await expect(fit.getByTestId("fit-method")).toHaveAttribute("data-assessment-id", assessment.id);
  expect(await fit.getByTestId("fit-match").textContent()).toBe(match);

  // A "no" given after the CV was saved belongs to today's assessment.
  const cv = await db.tailoredResume.findFirstOrThrow({ where: { workspaceId: ids.workspaceId } });
  const analysis = assessment.analysis as { requirements: { id: string; quote: string }[] };
  const graphql = analysis.requirements.find((r) => r.quote.includes("GraphQL"));
  expect(graphql).toBeDefined();
  await db.jobFitAnswer.create({
    data: { workspaceId: ids.workspaceId, targetJobId: cv.targetJobId, requirementId: graphql!.id, answer: "no", createdAt: new Date(cv.createdAt.getTime() + 60_000) },
  });
  await page.reload();
  await expect(fit.getByTestId("fit-method")).toHaveAttribute("data-assessment-id", assessment.id);
  expect(await fit.getByTestId("fit-match").textContent()).toBe(match);
  expect(await db.jobFitAssessment.count({ where: { workspaceId: ids.workspaceId } })).toBe(1);
  expect(await db.aiUsageLedger.count({ where: { workspaceId: ids.workspaceId } })).toBe(usage);
});

test("legacy, keyword-only and deleted-assessment CVs say so, with no number", async ({ page }) => {
  await seedCv("e2e-cvfit-legacy", "no-context");
  await seedCv("e2e-cvfit-keyword", { source: "keyword", assessmentId: null, rubricVersion: "fit_rubric@1", gaps: [] });
  await seedCv("e2e-cvfit-missing", { source: "ai", assessmentId: "gone-assessment", rubricVersion: "fit_rubric@1", gaps: [] });
  for (const [id, state] of [
    ["e2e-cvfit-legacy", "legacy"],
    ["e2e-cvfit-keyword", "keyword"],
    ["e2e-cvfit-missing", "missing"],
  ] as const) {
    await page.goto(`/tailor/${id}/preview`);
    const fit = page.getByTestId("cv-fit");
    await expect(fit).toHaveAttribute("data-state", state);
    await expect(fit).toContainText("Job fit has not been analyzed for this version");
    await expect(fit.getByTestId("fit-percent")).toHaveCount(0);
    await expect(fit).not.toContainText("%");
    await expect(page.locator("body")).not.toContainText(OLD_PANEL);
    await expect(fit.getByTestId("fit-analyze-link")).toHaveAttribute("href", `/tailor?from=${id}#tailor-flow`);
  }
  expect(await e2eDb().jobFitAssessment.count({ where: { workspaceId: ids.workspaceId } })).toBe(0);
});

const TITLES = {
  "nl-BE": "De jobmatch is voor deze versie niet geanalyseerd",
  "fr-BE": "L’adéquation au poste n’a pas été analysée pour cette version",
  "de-BE": "Die Stellenpassung wurde für diese Version nicht analysiert",
} as const;

test("the not-analyzed state is translated", async ({ page, context, baseURL }) => {
  await seedCv("e2e-cvfit-lang", "no-context");
  for (const [lang, title] of Object.entries(TITLES)) {
    await context.addCookies([{ name: "asafarim-lang", value: lang, url: baseURL ?? "http://localhost:3012" }]);
    await page.goto("/tailor/e2e-cvfit-lang/preview");
    await expect(page.getByTestId("cv-fit")).toContainText(title);
  }
});

const shots = process.env.CV_FIT_SHOTS;
const axePath = process.env.AXE_CORE_PATH;

test("screenshots and contrast of the CV's job fit", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set CV_FIT_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  await seedCv("e2e-cvfit-legacy", "no-context");
  // A recorded assessment, made through the app's own route (fixture provider).
  const res = await page.request.post("/api/tailor/fit", { data: { targetJobId: ids.jobId, profileVersionId: ids.versionId, language: "en" } });
  expect(res.ok()).toBe(true);
  const assessment = await e2eDb().jobFitAssessment.findFirstOrThrow({ where: { workspaceId: ids.workspaceId } });
  await seedCv("e2e-cvfit-recorded", { source: "ai", assessmentId: assessment.id, rubricVersion: "fit_rubric@1", gaps: [] });

  const project = testInfo.project.name.replace(/\s+/g, "-");
  const capture = async (name: string) => {
    await page.addStyleTag({ content: "header { position: static !important; } nextjs-portal { display: none !important; } *, *::before, *::after { transition: none !important; }" });
    const fit = page.getByTestId("cv-fit");
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      await page.mouse.move(0, 0);
      if (shots) await fit.screenshot({ path: `${shots}/${name}-${project}-${theme}.png` });
      if (axePath) {
        await page.addScriptTag({ path: axePath });
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
          const result = await axe.run({ include: [".rm-jfa--cv"] }, { runOnly: ["wcag2a", "wcag2aa"] });
          return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
        });
        expect(violations, `${name} ${theme}`).toEqual([]);
      }
    }
  };
  await page.goto("/tailor/e2e-cvfit-recorded/preview");
  await page.getByTestId("cv-fit").getByTestId("fit-details").locator("summary").click();
  await capture("recorded");
  await page.goto("/tailor/e2e-cvfit-legacy/preview");
  await capture("not-analyzed");
});
