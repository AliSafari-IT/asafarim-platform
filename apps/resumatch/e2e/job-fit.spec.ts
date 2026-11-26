import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #971 evidence-based job fit, on desktop and phone. A pasted job first
 * shows the labelled keyword check; "Analyze job fit" stores one
 * assessment; answering a question updates that same assessment; the
 * tailoring run carries it. An off-scope job asks first. Fixture AI
 * provider: no real AI call. Screenshots and axe contrast run when
 * JOB_FIT_SHOTS and/or AXE_CORE_PATH are set.
 */

const JOB_TEXT = `Senior Frontend Developer
We build web shops for small retailers.
Requirements:
- Experience with React and TypeScript
- Experience with Kubernetes in production
- Fluent in Dutch
- Knowledge of GraphQL
- Experience with Terraform`;

const NURSE_JOB = `Verpleegkundige ziekenhuis – afdeling geriatrie
Als verpleegkundige sta je in voor de zorg van patiënten op de afdeling geriatrie.
Je dient medicatie toe, volgt de patiënten op, verzorgt wonden en werkt nauw samen met artsen.
Vereisten: bachelor verpleegkunde, erkenning als verpleegkundige, ervaring in de zorg voor ouderen.
Je werkt in een ploegensysteem, ook in het weekend en 's nachts. Patiëntenzorg en empathie staan centraal.`;

const PROFILE = {
  fullName: "Jordan Example",
  email: "jordan@example.test",
  headline: "Full-stack developer · React · TypeScript",
  summary: "Full-stack developer building web applications with React and TypeScript.",
  skills: ["React", "TypeScript", "Node.js", "Playwright"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary: "Develops features in React and TypeScript. Writes end-to-end tests with Playwright.",
    },
    {
      title: "Support engineer",
      employer: "Helpdesk Example",
      summary: "Answered customer tickets. Kept the internal FAQ up to date.",
    },
  ],
};

let workspaceId = "";
test.beforeEach(async () => {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  workspaceId = workspace.id;
});

async function pasteJob(page: import("@playwright/test").Page, text: string) {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(text);
  await page.getByRole("button", { name: "Use this text" }).click();
}

test("analyze, answer, and continue: one assessment, updated in place, carried into the run", async ({ page }) => {
  await pasteJob(page, JOB_TEXT);
  const panel = page.getByTestId("fit-assessment");
  await expect(panel).toHaveAttribute("data-method", "keyword", { timeout: 30_000 });
  await expect(panel.getByTestId("fit-method")).toHaveText("Basic keyword check, not an AI analysis");
  // Nothing is spent until the candidate asks.
  expect(await e2eDb().jobFitAssessment.count({ where: { workspaceId } })).toBe(0);

  await panel.getByRole("button", { name: "Analyze job fit" }).click();
  await expect(panel).toHaveAttribute("data-method", "ai", { timeout: 30_000 });
  await expect(panel.getByTestId("fit-method")).toContainText("AI analysis");
  const stored = await e2eDb().jobFitAssessment.findFirstOrThrow({ where: { workspaceId } });
  expect(stored.status).toBe("complete");
  // Sources carry no name or contact details.
  expect(JSON.stringify(stored.analysis)).not.toMatch(/Jordan|jordan@example/);

  // Four of five are not stated: too little known for a percentage, and
  // nothing is called "not met".
  await expect(panel.getByTestId("fit-insufficient")).toContainText("Not enough information for a percentage");
  await expect(panel.getByTestId("fit-percent")).toHaveCount(0);
  await expect(panel.getByTestId("fit-suitability")).toContainText("Some essential conditions need your confirmation");
  await expect(panel.locator('[data-testid="fit-row"][data-judgment="unmet"]')).toHaveCount(0);
  const questions = panel.getByTestId("fit-questions").locator(".rm-reqs__question");
  await expect(questions).toHaveCount(3);

  // "No": the same assessment now shows a percentage with the gap.
  await questions.filter({ hasText: "Kubernetes" }).getByRole("button", { name: "No" }).click();
  await expect(panel.getByTestId("fit-percent")).toContainText("20%");
  await expect(panel.locator('[data-testid="fit-row"][data-judgment="unmet"]')).toHaveCount(1);

  // "Yes" needs the candidate's own words and a second confirm.
  const dutch = panel.locator(".rm-reqs__question").filter({ hasText: "Fluent in Dutch" });
  await dutch.getByRole("button", { name: "Yes, I have this" }).click();
  await dutch.getByLabel("Describe it in a sentence or two, in your own words").fill("Dutch is my first language; I worked with Dutch-speaking customers daily.");
  await dutch.getByRole("button", { name: "Review" }).click();
  expect(await e2eDb().candidateEvidence.count({ where: { workspaceId } })).toBe(0);
  await dutch.getByRole("button", { name: "Confirm and use" }).click();
  await expect(panel.getByTestId("fit-percent")).toContainText("40%");
  await expect(panel.getByTestId("fit-suitability")).toContainText("No essential condition is unmet");
  // Confirming does not make the analysis stale or start a new one.
  await expect(panel.getByTestId("fit-stale")).toHaveCount(0);
  const rows = await e2eDb().jobFitAssessment.findMany({ where: { workspaceId } });
  expect(rows.map((r) => r.id)).toEqual([stored.id]);
  expect(await e2eDb().jobFitAnswer.count({ where: { workspaceId, revokedAt: null } })).toBe(2);

  // The details explain the calculation.
  await panel.getByTestId("fit-calc").locator("summary").click();
  await expect(panel.getByTestId("fit-calc")).toContainText("6 of 15 points");

  // Reopening the job costs nothing: the stored assessment comes back.
  await page.reload();
  await expect(page.getByTestId("fit-assessment")).toHaveAttribute("data-method", "ai", { timeout: 30_000 });
  await expect(page.getByTestId("fit-percent")).toContainText("40%");

  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  const preview = await e2eDb().tailorPreview.findFirstOrThrow({ where: { workspaceId } });
  const context = preview.context as { fit: { source: string; assessmentId: string; gaps: string[] }; selection: { unmetRequirementIds: string[] } };
  expect(context.fit).toMatchObject({ source: "ai", assessmentId: stored.id });
  expect(context.fit.gaps).toContain("Experience with Kubernetes in production");
  expect(context.selection.unmetRequirementIds).toHaveLength(1);
  expect(await e2eDb().jobFitAssessment.count({ where: { workspaceId } })).toBe(1);
});

test("a misread requirement can be corrected, and the correction is kept", async ({ page }) => {
  await pasteJob(page, JOB_TEXT);
  const panel = page.getByTestId("fit-assessment");
  await panel.getByRole("button", { name: "Analyze job fit" }).click();
  await expect(panel).toHaveAttribute("data-method", "ai", { timeout: 30_000 });
  await panel.getByTestId("fit-details").locator("summary").click();
  const terraform = panel.getByTestId("fit-row").filter({ hasText: "Terraform" });
  await terraform.getByRole("button", { name: "Correct", exact: true }).click();
  await terraform.getByLabel("Correct how this requirement was read").selectOption("not_requirement");
  await expect(terraform).toContainText("You marked this as not a requirement");
  const corrections = await e2eDb().jobFitCorrection.findMany({ where: { workspaceId } });
  expect(corrections).toHaveLength(1);
  expect(corrections[0]).toMatchObject({ action: "not_requirement" });
  expect(await e2eDb().jobFitAssessment.count({ where: { workspaceId } })).toBe(1);
});

test("an off-scope job asks first; yes reveals the options, no goes back", async ({ page }) => {
  await pasteJob(page, NURSE_JOB);
  const gate = page.getByTestId("fit-gate");
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await expect(gate).toContainText("This job may be outside your scope");
  await expect(gate).toContainText("Do you really want to apply for this job?");
  const start = page.getByRole("button", { name: "Tailor my CV to this job" });
  await expect(start).toHaveCount(0);
  await gate.getByRole("button", { name: "Yes, tailor my CV anyway" }).click();
  await expect(page.getByTestId("fit-assessment")).toContainText("You chose to apply");
  await expect(start).toBeVisible();

  await pasteJob(page, NURSE_JOB);
  await page.getByTestId("fit-gate").getByRole("button", { name: "No, pick another job" }).click();
  await expect(page.getByTestId("fit-gate")).toHaveCount(0);
  await expect(start).toHaveCount(0);
});

const shots = process.env.JOB_FIT_SHOTS;
const axePath = process.env.AXE_CORE_PATH;

test("screenshots and contrast of the job fit panel", async ({ page }, testInfo) => {
  test.skip(!shots && !axePath, "set JOB_FIT_SHOTS=<dir> and/or AXE_CORE_PATH=<axe.min.js>");
  await pasteJob(page, JOB_TEXT);
  const panel = page.getByTestId("fit-assessment");
  await expect(panel).toHaveAttribute("data-method", "keyword", { timeout: 30_000 });
  const project = testInfo.project.name.replace(/\s+/g, "-");
  // The sticky app header would cover a tall element screenshot.
  await page.addStyleTag({ content: "header { position: static !important; }" });
  const capture = async (name: string) => {
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      await page.mouse.move(0, 0);
      if (shots) await panel.screenshot({ path: `${shots}/${name}-${project}-${theme}.png` });
      if (axePath) {
        await page.addScriptTag({ path: axePath });
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
          const result = await axe.run({ include: [".rm-jfa"] }, { runOnly: ["wcag2a", "wcag2aa"] });
          return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
        });
        expect(violations, `${name} ${theme}`).toEqual([]);
      }
    }
  };
  await capture("1-keyword");
  await panel.getByRole("button", { name: "Analyze job fit" }).click();
  await expect(panel).toHaveAttribute("data-method", "ai", { timeout: 30_000 });
  await panel.getByTestId("fit-questions").locator(".rm-reqs__question").filter({ hasText: "Kubernetes" }).getByRole("button", { name: "No" }).click();
  await expect(panel.getByTestId("fit-percent")).toContainText("20%");
  await panel.getByTestId("fit-details").locator("summary").click();
  await capture("2-analyzed");
});
