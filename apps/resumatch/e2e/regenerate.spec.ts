import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * "Regenerate" (2026-11-21): from a saved CV or its cover letter,
 * the candidate gets back to the tailoring options of the same job with the
 * saved choices filled in, can step back from the review to change them,
 * and regenerating saves a new CV without touching the old one. Uses the
 * fixture AI provider: no real AI call.
 */

const CV_ID = "e2e-regen-cv";
const CV_WITH_LETTER_ID = "e2e-regen-cv-letter";
const LETTER_ID = "e2e-regen-letter";

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

const CV_CONTENT = {
  contractVersion: "1.0.0",
  fullName: "Jordan Example",
  headline: "Full-stack developer",
  summary: "Full-stack developer.",
  skills: ["React", "TypeScript"],
  experience: [],
  education: [],
  certifications: [],
};

async function seed() {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: {
      profileId: profile.id,
      versionNumber: 1,
      origin: "MANUAL",
      extractorName: "manual",
      extractorVersion: "1",
      content: PROFILE,
    },
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
  const common = {
    workspaceId: workspace.id,
    profileVersionId: version.id,
    targetJobId: job.id,
    templateKey: "classic",
    promptVersion: "e2e",
    modelVersion: "e2e",
    content: CV_CONTENT,
  };
  await prisma.tailoredResume.create({
    data: { ...common, id: CV_ID, outputLanguage: "nl", instructions: "Lead with my testing work" },
  });
  await prisma.tailoredResume.create({
    data: {
      ...common,
      id: CV_WITH_LETTER_ID,
      outputLanguage: "en",
      skillsLayout: "paragraph",
      skillsParagraph: "Builds React and TypeScript applications.",
    },
  });
  await prisma.coverLetter.create({
    data: {
      id: LETTER_ID,
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      tailoredResumeId: CV_WITH_LETTER_ID,
      promptVersion: "cover_letter@5",
      modelVersion: "e2e",
      outputLanguage: "fr",
      content: {
        contractVersion: "1.0.0",
        greeting: "Madame, Monsieur,",
        paragraphs: ["Je souhaite postuler."],
        signOff: "Cordialement,",
        fullName: "Jordan Example",
      },
    },
  });
}

test.beforeEach(async () => {
  await seed();
});

test("a saved CV reopens its job with its choices, and regenerating saves a new CV", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  await page.getByTestId("edit-regenerate").click();
  await expect(page).toHaveURL(new RegExp(`/tailor\\?from=${CV_ID}`));

  const note = page.getByTestId("regenerate-note");
  await expect(note).toBeVisible();
  await expect(note.getByRole("link", { name: "← Back to the saved CV" })).toHaveAttribute("href", `/tailor/${CV_ID}/preview`);

  const flow = page.locator("#tailor-flow");
  await expect(flow.getByText("Senior Frontend Developer").first()).toBeVisible();
  await expect(flow.locator("select").first()).toHaveValue("nl");
  await expect(flow.locator("textarea").last()).toHaveValue("Lead with my testing work");
  const letterBox = flow.getByRole("checkbox", { name: /cover letter/i });
  await expect(letterBox).not.toBeChecked();

  // Change something, run, then step back from the review: choices are kept.
  await letterBox.check();
  const run = flow.getByRole("button", { name: "Regenerate for this job" });
  await run.click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await flow.getByRole("button", { name: "← Back to options" }).click();
  await expect(flow.locator(".rm-review")).toHaveCount(0);
  await expect(letterBox).toBeChecked();
  await expect(flow.locator("select").first()).toHaveValue("nl");

  await run.click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/(?!e2e-regen-cv\/)[^/]+\/preview/, { timeout: 30_000 });

  // The new CV is a separate row; the one it started from is untouched.
  const rows = await e2eDb().tailoredResume.findMany({ where: { targetJob: { title: "Senior Frontend Developer" } } });
  expect(rows).toHaveLength(3);
  expect(rows.find((row) => row.id === CV_ID)?.instructions).toBe("Lead with my testing work");
});

test("a CV without a letter offers to add one", async ({ page }) => {
  await page.goto(`/tailor/${CV_ID}/preview`);
  await page.getByRole("link", { name: "Add a cover letter" }).click();
  await expect(page.getByTestId("regenerate-note")).toBeVisible();
  await expect(page.locator("#tailor-flow").getByRole("checkbox", { name: /cover letter/i })).toBeChecked();
});

test("a cover letter reopens its job with the letter ticked and its own language", async ({ page }) => {
  await page.goto(`/cover-letter/${LETTER_ID}/preview`);
  await page.getByTestId("edit-regenerate-letter").click();
  await expect(page.getByTestId("regenerate-note")).toBeVisible();
  const flow = page.locator("#tailor-flow");
  await expect(flow.getByRole("checkbox", { name: /cover letter/i })).toBeChecked();
  // CV language, then the letter's tone, length and language.
  await expect(flow.locator("select").first()).toHaveValue("en");
  await expect(flow.locator("select").last()).toHaveValue("fr");
});

test("an unknown id opens the normal empty flow", async ({ page }) => {
  await page.goto("/tailor?from=not-a-real-cv");
  await expect(page.locator("#tailor-flow")).toBeVisible();
  await expect(page.getByTestId("regenerate-note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Regenerate for this job" })).toHaveCount(0);
});
