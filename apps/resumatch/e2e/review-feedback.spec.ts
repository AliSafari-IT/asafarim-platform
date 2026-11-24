import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * Review feedback and its explicit scope (#932): the review lists what the
 * candidate changed from the suggestions; a plain save records it for this
 * application only; "Add to my background" and "Write a style note" each
 * show the exact update and save it once with the CV. Paste intake and the
 * fixture AI provider: no real AI call. Synthetic data only.
 */

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer",
  summary: "Full-stack developer building web applications with React and TypeScript.",
  skills: ["Docker", "React", "TypeScript", "Playwright"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      startedOn: "2021-03",
      summary: "Built React dashboards for logistics teams. Wrote Playwright end-to-end tests. Ran weekly releases.",
    },
  ],
};

const JOB = `Senior Frontend Developer (React / TypeScript)
We are looking for a frontend developer to build our React applications.
You write TypeScript every day and test with Playwright.
Requirements: 4+ years React, TypeScript, REST APIs and CI/CD pipelines.
You develop new features for our web applications with the product team.`;

let workspaceId = "";

test.beforeEach(async () => {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  workspaceId = workspace.id;
  const profile = await prisma.candidateProfile.create({ data: { workspaceId } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
});

async function openReview(page: import("@playwright/test").Page) {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).filter({ visible: true }).click();
  await page.getByPlaceholder("Paste the full job description here…").filter({ visible: true }).fill(JOB);
  await page.getByRole("button", { name: "Use this text" }).filter({ visible: true }).click();
  const flow = page.locator("#tailor-flow");
  await flow.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  return flow;
}

const ROLE = "Full-stack developer · Example Software";

test("a plain save records each decision for this application only", async ({ page }) => {
  const flow = await openReview(page);
  const panel = flow.getByTestId("feedback-panel");
  await expect(panel.getByTestId("feedback-summary")).toContainText("You kept all");

  // Edit bullet 1, leave out bullet 3.
  await flow.getByLabel(`Bullet 1 for ${ROLE}`, { exact: true }).fill("Built React dashboards used daily by 40 logistics planners.");
  await flow.getByLabel(`Keep bullet 3 for ${ROLE}`).uncheck();
  await expect(panel.getByTestId("feedback-item")).toHaveCount(2);
  await expect(panel.locator('[data-key="bullet:0:0"]')).toContainText("Edited");
  await expect(panel.locator('[data-key="bullet:0:2"]')).toContainText("Left out");
  await panel.locator('[data-key="bullet:0:2"]').getByRole("combobox").selectOption("not_relevant");

  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/);

  const feedback = await e2eDb().tailoringFeedback.findFirstOrThrow({ where: { workspaceId } });
  const decisions = Object.fromEntries((feedback.decisions as { key: string }[]).map((d) => [d.key, d]));
  expect(decisions["bullet:0:0"]).toMatchObject({ decision: "edited", final: "Built React dashboards used daily by 40 logistics planners.", scope: "application" });
  expect(decisions["bullet:0:1"]).toMatchObject({ decision: "accepted" });
  expect(decisions["bullet:0:2"]).toMatchObject({ decision: "rejected", reason: "not_relevant" });
  expect(feedback.promotions).toBeNull();
  expect(await e2eDb().candidateEvidence.count({ where: { workspaceId } })).toBe(0);
  expect(await e2eDb().writingPreferenceRevision.count({ where: { workspaceId } })).toBe(0);

  const res = await page.request.get(`/api/tailor/${feedback.tailoredResumeId}/feedback`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  const edited = body.items.find((i: { key: string }) => i.key === "bullet:0:0");
  expect(edited).toMatchObject({ original: "Built React dashboards for logistics teams.", saved: "Built React dashboards used daily by 40 logistics planners." });
});

test("background and style note are explicit, reviewed, and saved once with the CV", async ({ page }) => {
  const flow = await openReview(page);
  const panel = flow.getByTestId("feedback-panel");
  const text = "Built React dashboards used daily by 40 logistics planners.";
  await flow.getByLabel(`Bullet 1 for ${ROLE}`, { exact: true }).fill(text);

  const background = panel.getByTestId("feedback-background");
  await background.getByRole("button", { name: "Add to my background…" }).click();
  await expect(background).toContainText(`added to your confirmed background for ${ROLE}`);
  await background.getByLabel("Title").fill("Logistics dashboards");

  const preference = panel.getByTestId("feedback-preference");
  await preference.getByRole("button", { name: "Write a style note…" }).click();
  await expect(preference).toContainText("Saved now: none");
  await preference.getByLabel("CV style note").fill("Say I have 10 years of React.");
  await expect(preference).toContainText("reads like a fact about you");
  await preference.getByLabel("CV style note").fill("Lead with measurable results.");

  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/);
  await expect(page.getByText("something you chose to remember could not be saved")).toHaveCount(0);

  const evidence = await e2eDb().candidateEvidence.findMany({ where: { workspaceId }, include: { revisions: true } });
  expect(evidence).toHaveLength(1);
  expect(evidence[0]).toMatchObject({ scope: "BACKGROUND", targetJobId: null });
  expect(evidence[0]!.revisions[0]).toMatchObject({
    kind: "ACHIEVEMENT",
    title: "Logistics dashboards",
    detail: text,
    status: "CONFIRMED",
    experienceRef: { title: "Full-stack developer", employer: "Example Software", startedOn: "2021-03" },
  });
  const prefs = await e2eDb().writingPreferenceRevision.findMany({ where: { workspaceId } });
  expect(prefs).toHaveLength(1);
  expect(prefs[0]!.content).toMatchObject({ cv: { styleNote: "Lead with measurable results." } });

  const feedback = await e2eDb().tailoringFeedback.findFirstOrThrow({ where: { workspaceId } });
  expect(feedback.promotions).toMatchObject({ preference: { status: "saved", revisionNumber: 1 }, background: [{ status: "saved", feedbackKey: "bullet:0:0" }] });
  expect((feedback.decisions as { key: string; scope: string }[]).find((d) => d.key === "bullet:0:0")!.scope).toBe("background");

  // Going back and saving again cannot record or promote anything twice.
  await page.goBack();
  const again = await page.request.post("/api/tailor/generate-confirm", {
    data: {
      profileVersionId: (await e2eDb().tailorPreview.findFirstOrThrow({ where: { workspaceId } })).profileVersionId,
      targetJobId: (await e2eDb().tailorPreview.findFirstOrThrow({ where: { workspaceId } })).targetJobId,
      previewId: feedback.previewId,
      approved: null,
      promotions: { background: [{ experienceIndex: 0, bulletIndex: 0, kind: "ACHIEVEMENT", title: "Again", detail: text }] },
    },
  });
  expect(again.status()).toBe(409);
  expect(await e2eDb().candidateEvidence.count({ where: { workspaceId } })).toBe(1);
  expect(await e2eDb().tailoringFeedback.count({ where: { workspaceId } })).toBe(1);
});
