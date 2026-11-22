import mammoth from "mammoth";
import type { Page } from "@playwright/test";
import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * "Edit" on a saved tailored CV (0.5.0): the review comes back exactly as
 * it was saved, with no AI call, and saving updates the same CV and letter.
 * "Regenerate" (the old "Edit and regenerate") keeps the candidate's own
 * summary. The candidate's own summary reaches the preview (what the PDF
 * prints) and the DOCX.
 */

const CV_ID = "e2e-edit-cv";
const LETTER_ID = "e2e-edit-letter";
const OWN_BULLET = "Wrote the team's GraphQL schema guidelines.";
const AI_BULLET = "Built React features end to end with TypeScript.";
const MY_SUMMARY = "In my own words: I build and test web platforms with React and Playwright.";

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer",
  summary: "Full-stack developer building web applications with React, TypeScript and Node.js.",
  skills: ["React", "TypeScript", "Node.js", "Playwright", "Docker"].map((name) => ({ name })),
  experience: [
    {
      title: "Full-stack developer",
      employer: "Example Software",
      summary: "End-to-end testing of web platforms with Playwright; develops features in React and Node.js.",
    },
  ],
};

let profileVersionId = "";

async function seed() {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  profileVersionId = version.id;
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  const job = await prisma.targetJob.create({
    data: {
      workspaceId: workspace.id,
      sourceUrl: "https://jobs.example.test/edit",
      rawText: "Senior Frontend Developer. React, TypeScript, GraphQL, Docker.",
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
      promptVersion: "e2e",
      modelVersion: "e2e",
      outputLanguage: "en",
      instructions: "keep it short",
      skillsParagraph: "Works with React and TypeScript.",
      content: {
        contractVersion: "1.0.0",
        fullName: "Jordan Example",
        headline: "Frontend developer · React",
        summary: "AI-written summary for this job.",
        skills: ["TypeScript", "React", "Node.js", "Playwright", "GraphQL"],
        experience: [
          { title: "Full-stack developer", employer: "Example Software", bullets: [AI_BULLET, OWN_BULLET] },
        ],
        education: [],
        certifications: [],
      },
      candidateEdits: {
        addedSkills: ["GraphQL"],
        removedSkills: ["Docker"],
        ownBullets: [{ title: "Full-stack developer", employer: "Example Software", bullets: [OWN_BULLET] }],
      },
    },
  });
  await prisma.coverLetter.create({
    data: {
      id: LETTER_ID,
      workspaceId: workspace.id,
      profileVersionId: version.id,
      targetJobId: job.id,
      tailoredResumeId: CV_ID,
      promptVersion: "e2e",
      modelVersion: "e2e",
      outputLanguage: "en",
      content: {
        contractVersion: "1.0.0",
        greeting: "Dear Hiring Manager,",
        paragraphs: ["I would like to apply for the role.", "I build React applications."],
        signOff: "Sincerely,",
        fullName: "Jordan Example",
      },
    },
  });
}

test.beforeEach(async () => {
  await seed();
});

const ROLE = "Full-stack developer · Example Software";

async function openEdit(page: Page) {
  await page.goto(`/tailor/${CV_ID}/preview`);
  const toolbar = page.locator(".rm-preview-toolbar");
  await expect(toolbar.getByRole("link", { name: "Regenerate", exact: true })).toBeVisible();
  await toolbar.getByRole("link", { name: "Edit", exact: true }).click();
  await page.waitForURL(/\/tailor\?edit=/);
  const flow = page.locator("#tailor-flow");
  await expect(flow.locator(".rm-review")).toBeVisible();
  return flow;
}

test("Edit reopens the saved review filled in, with no AI call", async ({ page }) => {
  let aiCalls = 0;
  await page.route("**/api/tailor/generate-preview", (route) => {
    aiCalls += 1;
    return route.continue();
  });
  const flow = await openEdit(page);

  await expect(flow.getByText("Edit your saved CV")).toBeVisible();
  await expect(flow.getByRole("button", { name: "Regenerate for this job" })).toHaveCount(0);
  await expect(flow.getByLabel("Headline")).toHaveValue("Frontend developer · React");
  await expect(flow.getByLabel("Summary")).toHaveValue("AI-written summary for this job.");
  const skills = flow.getByTestId("review-skills");
  await expect(skills.locator(".rm-skill-chip--own")).toHaveText(/GraphQL/);
  await expect(skills.getByRole("button", { name: "Put Docker back" })).toBeVisible();
  await expect(flow.getByRole("textbox", { name: `Bullet 1 for ${ROLE}` })).toHaveValue(AI_BULLET);
  await expect(flow.getByRole("textbox", { name: `Bullet 2 for ${ROLE}` })).toHaveValue(OWN_BULLET);
  await expect(flow.getByLabel("Paragraph 2")).toHaveValue("I build React applications.");
  expect(aiCalls).toBe(0);

  // Cancel goes back to the same CV, unchanged.
  await flow.getByRole("link", { name: "Cancel" }).click();
  await page.waitForURL(new RegExp(`/tailor/${CV_ID}/preview`));
});

test("saving an edit updates the same CV and letter; own summary reaches preview and DOCX", async ({ page }) => {
  const flow = await openEdit(page);
  await flow.getByLabel("Summary").fill(MY_SUMMARY);
  await flow.getByRole("textbox", { name: `Bullet 1 for ${ROLE}` }).fill("Reworded on edit: React features end to end.");
  await flow.getByTestId("review-skills").getByRole("button", { name: "Remove Node.js from this CV" }).click();
  await flow.getByLabel("Paragraph 2").fill("I build and test React applications.");

  await flow.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/tailor/${CV_ID}/preview\\?coverLetterId=${LETTER_ID}`));
  await expect(page.locator(".rm-resume__summary")).toHaveText(MY_SUMMARY);

  const prisma = e2eDb();
  expect(await prisma.tailoredResume.count({ where: { workspace: { platformUserId: E2E_PLATFORM_USER_ID } } })).toBe(1);
  const row = await prisma.tailoredResume.findUniqueOrThrow({ where: { id: CV_ID } });
  const content = row.content as { summary: string; skills: string[]; experience: { bullets: string[] }[] };
  expect(content.summary).toBe(MY_SUMMARY);
  expect(content.skills).toEqual(["TypeScript", "React", "Playwright", "GraphQL"]);
  expect(content.experience[0].bullets).toEqual(["Reworded on edit: React features end to end.", OWN_BULLET]);
  expect(row.candidateEdits).toMatchObject({
    addedSkills: ["GraphQL"],
    removedSkills: ["Docker", "Node.js"],
    ownSummary: MY_SUMMARY,
  });
  // Provenance is the first save's; the skills paragraph no longer matches.
  expect(row.promptVersion).toBe("e2e");
  expect(row.outputLanguage).toBe("en");
  expect(row.instructions).toBe("keep it short");
  expect(row.skillsParagraph).toBeNull();
  const letter = await prisma.coverLetter.findUniqueOrThrow({ where: { id: LETTER_ID } });
  expect((letter.content as { paragraphs: string[] }).paragraphs).toEqual([
    "I would like to apply for the role.",
    "I build and test React applications.",
  ]);
  // The profile is untouched.
  const version = await prisma.candidateProfileVersion.findUniqueOrThrow({ where: { id: profileVersionId } });
  expect((version.content as typeof PROFILE).summary).toBe(PROFILE.summary);

  const docx = await page.request.get(`/api/tailor/${CV_ID}/docx`);
  expect(docx.status()).toBe(200);
  const { value: text } = await mammoth.extractRawText({ buffer: await docx.body() });
  expect(text).toContain(MY_SUMMARY);

  // Editing again starts from what was just saved.
  const again = await openEdit(page);
  await expect(again.getByLabel("Summary")).toHaveValue(MY_SUMMARY);
});

test("Use my profile summary puts the profile's own summary on the CV", async ({ page }) => {
  const flow = await openEdit(page);
  await flow.getByRole("button", { name: "Use my profile summary" }).click();
  await expect(flow.getByLabel("Summary")).toHaveValue(PROFILE.summary);
  await flow.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/tailor/${CV_ID}/preview`));
  await expect(page.locator(".rm-resume__summary")).toHaveText(PROFILE.summary);
});

test("Regenerate keeps the candidate's own summary and saves a new CV", async ({ page }) => {
  await e2eDb().tailoredResume.update({
    where: { id: CV_ID },
    data: {
      content: {
        contractVersion: "1.0.0",
        fullName: "Jordan Example",
        headline: "Frontend developer · React",
        summary: MY_SUMMARY,
        skills: ["React"],
        experience: [],
        education: [],
        certifications: [],
      },
      candidateEdits: { ownSummary: MY_SUMMARY },
    },
  });
  await page.goto(`/tailor/${CV_ID}/preview`);
  await page.locator(".rm-preview-toolbar").getByRole("link", { name: "Regenerate", exact: true }).click();
  const flow = page.locator("#tailor-flow");
  await flow.getByRole("button", { name: "Regenerate for this job" }).click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  await expect(flow.getByLabel("Summary")).toHaveValue(MY_SUMMARY);
  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(new RegExp(`/tailor/(?!${CV_ID})[^/]+/preview`), { timeout: 30_000 });
  await expect(page.locator(".rm-resume__summary")).toHaveText(MY_SUMMARY);
  const newId = page.url().match(/\/tailor\/([^/?]+)\/preview/)![1];
  const row = await e2eDb().tailoredResume.findUniqueOrThrow({ where: { id: newId } });
  expect(row.candidateEdits).toMatchObject({ ownSummary: MY_SUMMARY });
});
