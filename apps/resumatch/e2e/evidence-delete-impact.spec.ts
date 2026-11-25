import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #933: deleting evidence says what it touches before the candidate
 * confirms, then removes the previews made with it and the review feedback
 * of saved CVs that used it. The CV itself keeps its text. Desktop and
 * phone; fixture AI provider, no real AI call.
 */

const JOB_TEXT = `Platform Engineer
We run Kubernetes clusters and need someone who automates releases.
Requirements: CI/CD pipelines, Docker, incident response.`;

const PROFILE = {
  fullName: "Jordan Example",
  headline: "DevOps engineer",
  summary: "DevOps engineer automating CI/CD with Docker.",
  skills: ["Docker", "CI/CD"].map((name) => ({ name })),
  experience: [{ title: "DevOps engineer", employer: "Example Hosting", summary: "Automated releases with Docker and CI/CD pipelines." }],
};

async function seed() {
  const db = e2eDb();
  await db.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await db.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await db.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await db.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await db.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  const evidence = await db.candidateEvidence.create({
    data: {
      workspaceId: workspace.id,
      scope: "BACKGROUND",
      revisions: { create: { workspaceId: workspace.id, revisionNumber: 1, kind: "ACHIEVEMENT", title: "Release automation", detail: "Cut release time from a day to an hour.", status: "CONFIRMED", confirmedAt: new Date() } },
    },
    include: { revisions: true },
  });
  const revisionId = evidence.revisions[0]!.id;
  const oldJob = await db.targetJob.create({ data: { workspaceId: workspace.id, sourceUrl: "manual://old", rawText: JOB_TEXT, title: "Old job", status: "FETCHED" } });
  const context = { contextVersion: "tailoring_context@1", workspaceId: workspace.id, evidenceRevisionIds: [revisionId] };
  const preview = await db.tailorPreview.create({
    data: { workspaceId: workspace.id, profileVersionId: version.id, targetJobId: oldJob.id, promptVersion: "tailor_resume@9", modelVersion: "fixture", degraded: false, context, suggestions: { summary: "x" }, consumedAt: new Date() },
  });
  const cv = await db.tailoredResume.create({
    data: {
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: oldJob.id,
      content: { skills: ["Docker"], experience: [], education: [], certifications: [] },
      templateKey: "classic",
      promptVersion: "tailor_resume@9",
      modelVersion: "fixture",
      tailoringContext: context,
      feedback: { create: { workspaceId: workspace.id, previewId: preview.id, feedbackVersion: "tailoring_feedback@1", original: { cv: {} }, decisions: [] } },
    },
  });
  return { workspaceId: workspace.id, cvId: cv.id, previewId: preview.id };
}

test("the delete dialog names the affected history, and the delete removes hidden copies only", async ({ page }) => {
  const { workspaceId, cvId, previewId } = await seed();
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  const panel = page.getByTestId("evidence-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("summary").click();

  const item = panel.getByTestId("evidence-item").filter({ hasText: "Release automation" });
  await item.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("1 saved CV(s) used it. They keep their wording, but the review notes recorded for them are removed.");
  await expect(dialog).toContainText("Unsaved suggestions made with it are discarded.");
  await page.screenshot({ path: test.info().outputPath("delete-impact.png") });

  // Cancel changes nothing.
  await dialog.getByRole("button", { name: "Keep it" }).click();
  const db = e2eDb();
  expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: cvId } })).toBe(1);

  await item.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(panel.getByText("Deleted.")).toBeVisible();
  expect(await db.candidateEvidence.count({ where: { workspaceId } })).toBe(0);
  expect(await db.tailorPreview.count({ where: { id: previewId } })).toBe(0);
  expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: cvId } })).toBe(0);
  expect(await db.tailoredResume.count({ where: { id: cvId } })).toBe(1);
});
