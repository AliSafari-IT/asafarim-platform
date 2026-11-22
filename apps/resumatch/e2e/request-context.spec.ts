import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #928 request context: one note steers the CV and the letter, the saved CV
 * keeps the context it was made with (so Regenerate brings back the letter's
 * tone and length), and a review whose job text changed underneath it can't
 * be saved. Fixture AI provider: no real AI call.
 */

const CV_ID = "e2e-ctx-cv";
const NOTE = "Lead with my Playwright testing work.";

const JOB_TEXT = `Senior Frontend Developer (React / TypeScript)
We are looking for a frontend developer to build our React applications.
You write TypeScript every day, use Node.js tooling, and test with Playwright.
Requirements: 4+ years React, TypeScript, REST APIs, Docker, CI/CD pipelines.`;

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer · React · TypeScript",
  summary: "Full-stack developer building web applications with React, TypeScript and Node.js. Writes end-to-end tests with Playwright.",
  skills: ["React", "TypeScript", "Node.js", "Playwright", "Docker"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary: "End-to-end testing of web platforms with Playwright; develops features in React and Node.js.",
    },
  ],
};

async function seed() {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  const job = await prisma.targetJob.create({
    data: {
      workspaceId: workspace.id,
      sourceUrl: "https://jobs.example.test/frontend",
      rawText: JOB_TEXT,
      title: "Senior Frontend Developer",
      employer: "Example Audio",
      status: "FETCHED",
    },
  });
  await prisma.tailoredResume.create({
    data: {
      id: CV_ID,
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      templateKey: "classic",
      promptVersion: "tailor_resume@6",
      modelVersion: "e2e",
      outputLanguage: "en",
      instructions: NOTE,
      content: {
        contractVersion: "1.0.0",
        fullName: "Jordan Example",
        headline: "Full-stack developer",
        summary: "Full-stack developer.",
        skills: ["React", "TypeScript"],
        experience: [],
        education: [],
        certifications: [],
      },
      tailoringContext: {
        version: "tailoring_context@1",
        workspaceId: workspace.id,
        profileVersionId: version.id,
        targetJobId: job.id,
        jobTextFingerprint: "e2e",
        jobTextUsed: null,
        instructions: NOTE,
        lowFit: false,
        cv: { outputLanguage: "en" },
        coverLetter: { outputLanguage: "en", tone: "confident", length: "short" },
        preferenceRevisionId: null,
        evidenceRevisionIds: [],
      },
    },
  });
  await prisma.coverLetter.create({
    data: {
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      tailoredResumeId: CV_ID,
      promptVersion: "cover_letter@5",
      modelVersion: "e2e",
      outputLanguage: "en",
      content: {
        contractVersion: "1.0.0",
        greeting: "Dear Hiring Manager,",
        paragraphs: ["I would like to apply."],
        signOff: "Kind regards,",
        fullName: "Jordan Example",
      },
    },
  });
  return { jobId: job.id };
}

let jobId = "";
test.beforeEach(async () => {
  ({ jobId } = await seed());
});

test("Regenerate brings back the letter's tone and length, and the new CV keeps the shared context", async ({ page }) => {
  await page.goto(`/tailor?from=${CV_ID}`);
  const flow = page.locator("#tailor-flow");
  await expect(flow.getByRole("checkbox", { name: /cover letter/i })).toBeChecked();
  // CV language, then the letter's tone, length and language.
  const selects = flow.locator("select");
  await expect(selects.nth(1)).toHaveValue("confident");
  await expect(selects.nth(2)).toHaveValue("short");
  await expect(flow.locator("textarea").last()).toHaveValue(NOTE);

  await flow.getByRole("button", { name: "Regenerate for this job" }).click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/(?!e2e-ctx-cv\/)[^/]+\/preview/, { timeout: 30_000 });

  const db = e2eDb();
  const saved = await db.tailoredResume.findFirstOrThrow({
    where: { targetJobId: jobId, NOT: { id: CV_ID } },
    include: { coverLetter: true },
  });
  expect(saved.instructions).toBe(NOTE);
  expect(saved.promptVersion).toBe("tailor_resume@7");
  expect(saved.tailoringContext).toMatchObject({
    version: "tailoring_context@1",
    instructions: NOTE,
    jobTextUsed: null,
    coverLetter: { tone: "confident", length: "short" },
  });
  expect(saved.coverLetter?.promptVersion).toBe("cover_letter@6");

  // The preview it was saved from holds the full snapshot, job text included.
  const preview = await db.tailorPreview.findFirstOrThrow({ where: { targetJobId: jobId, consumedAt: { not: null } } });
  expect(preview.contextVersion).toBe("tailoring_context@1");
  expect(preview.contextFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(preview.context).toMatchObject({ instructions: NOTE, jobTextUsed: JOB_TEXT });
});

test("a review can't be saved after its job text changed", async ({ page }) => {
  await page.goto(`/tailor?from=${CV_ID}`);
  const flow = page.locator("#tailor-flow");
  await flow.getByRole("button", { name: "Regenerate for this job" }).click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });

  await e2eDb().targetJob.update({ where: { id: jobId }, data: { rawText: `${JOB_TEXT}\nAlso: Kubernetes.` } });
  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await expect(page.getByText("The job text changed after these suggestions were made. Generate them again.")).toBeVisible();
  // The review stays open, so hand edits can still be copied.
  await expect(flow.locator(".rm-review")).toBeVisible();
  expect(await e2eDb().tailoredResume.count({ where: { targetJobId: jobId } })).toBe(1);
  // The preview was not used up by the refused save.
  expect(await e2eDb().tailorPreview.count({ where: { targetJobId: jobId, consumedAt: null } })).toBe(1);
});
