import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #930 requirement selection and clarification, on desktop and phone.
 * The options card lists what the job asks for against the profile and
 * asks at most three optional questions. "No" marks a requirement unmet
 * for this run; "Yes" needs the candidate's own words and a second confirm
 * before it is saved as confirmed evidence. The review shows the sources
 * each AI bullet cites. Fixture AI provider: no real AI call.
 */

const JOB_TEXT = `Senior Frontend Developer
We build web shops for small retailers.
Requirements:
- Experience with React and TypeScript
- Experience with Kubernetes in production
- Fluent in Dutch
- Knowledge of GraphQL
- Experience with Terraform`;

const PROFILE = {
  fullName: "Jordan Example",
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

test("requirements, three optional questions, a confirmed 'yes', a 'no', and cited sources on the review", async ({ page }) => {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();

  const panel = page.getByTestId("requirements-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator("summary")).toContainText("(1 of 5 in your profile)");
  // Absence is unknown, never "you lack it"; at most three questions.
  await expect(panel.getByText("Not in your profile")).toHaveCount(4);
  const questions = panel.locator(".rm-reqs__question");
  await expect(questions).toHaveCount(3);

  // "No": unmet for this run, the question goes away, and Undo is offered.
  const k8s = questions.filter({ hasText: "Kubernetes" });
  await k8s.getByRole("button", { name: "No" }).click();
  await expect(panel.getByText("You said no")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Undo" })).toBeVisible();

  // "Yes" asks for the candidate's own words, then a separate confirm.
  const dutch = panel.locator(".rm-reqs__question").filter({ hasText: "Fluent in Dutch" });
  await dutch.getByRole("button", { name: "Yes, I have this" }).click();
  await dutch.getByLabel("Describe it in a sentence or two, in your own words").fill("Dutch is my first language; I worked with Dutch-speaking customers daily.");
  await dutch.getByRole("button", { name: "Review" }).click();
  await expect(dutch.getByText("This will be saved as confirmed evidence for this application")).toBeVisible();
  expect(await e2eDb().candidateEvidence.count({ where: { workspaceId } })).toBe(0);
  await dutch.getByRole("button", { name: "Confirm and use" }).click();
  await expect(panel.getByText("Saved as confirmed evidence for this application.")).toBeVisible();
  await expect(panel.locator("summary")).toContainText("(2 of 5 in your profile)");
  const evidence = await e2eDb().candidateEvidence.findMany({ where: { workspaceId }, include: { revisions: true } });
  expect(evidence).toHaveLength(1);
  expect(evidence[0]!.scope).toBe("APPLICATION");
  expect(evidence[0]!.revisions[0]).toMatchObject({ status: "CONFIRMED", title: "Fluent in Dutch" });

  // Generate: the run carries the "no", and the review cites each bullet's source.
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Based on: Full-stack developer · Example Software").first()).toBeVisible();
  await expect(page.getByText("Based on: Support engineer · Helpdesk Example").first()).toBeVisible();
  await expect(page.getByTestId("requirements-review-note")).toContainText("job requirement(s) aren't backed by your profile");

  const preview = await e2eDb().tailorPreview.findFirstOrThrow({ where: { workspaceId } });
  const context = preview.context as { selection: { unmetRequirementIds: string[] }; evidenceRevisionIds: string[] };
  expect(context.selection.unmetRequirementIds).toHaveLength(1);
  expect(context.evidenceRevisionIds).toEqual([evidence[0]!.revisions[0]!.id]);

  await page.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/, { timeout: 30_000 });
});

test("skipping every question still generates, claiming nothing the profile lacks", async ({ page }) => {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  await expect(page.getByTestId("requirements-panel")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".rm-review")).not.toContainText(/Kubernetes|GraphQL|Terraform/);
  const preview = await e2eDb().tailorPreview.findFirstOrThrow({ where: { workspaceId } });
  expect((preview.context as { selection: { unmetRequirementIds: string[] } }).selection.unmetRequirementIds).toEqual([]);
});
