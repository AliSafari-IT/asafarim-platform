import mammoth from "mammoth";
import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * Hand edits on the Tailor review (2026-11-22): the candidate removes and
 * adds skills, rewrites an AI bullet and writes one of their own. The saved
 * CV, its preview (what the PDF prints) and its DOCX carry exactly that,
 * the profile is untouched, and "Edit and regenerate" brings the edits
 * back. Uses the fixture AI provider: no real AI call.
 */

const CV_ID = "e2e-edits-cv";
const CV_EDITED_ID = "e2e-edits-cv-edited";

const PROFILE = {
  fullName: "Jordan Example",
  headline: "Full-stack developer · React · TypeScript",
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

const JOB_TEXT = `Senior Frontend Developer (React / TypeScript)
We are looking for a frontend developer to build our React applications.
Requirements: 4+ years React, TypeScript, REST APIs, Docker, GraphQL.`;

const OWN_BULLET = "Wrote the team's GraphQL schema guidelines.";

let versionId = "";

async function seed() {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: E2E_PLATFORM_USER_ID } });
  const workspace = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: workspace.id } });
  const version = await prisma.candidateProfileVersion.create({
    data: { profileId: profile.id, versionNumber: 1, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content: PROFILE },
  });
  versionId = version.id;
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: version.id } });
  const job = await prisma.targetJob.create({
    data: {
      workspaceId: workspace.id,
      sourceUrl: "https://jobs.example.test/edits",
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
    outputLanguage: "en",
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
  };
  await prisma.tailoredResume.create({ data: { ...common, id: CV_ID } });
  await prisma.tailoredResume.create({
    data: {
      ...common,
      id: CV_EDITED_ID,
      candidateEdits: {
        addedSkills: ["GraphQL"],
        removedSkills: ["Docker"],
        ownBullets: [{ title: "Full-stack developer", employer: "Example Software", bullets: [OWN_BULLET] }],
      },
    },
  });
}

test.beforeEach(async () => {
  await seed();
});

async function openReview(page: import("@playwright/test").Page, from: string) {
  await page.goto(`/tailor?from=${from}`);
  const flow = page.locator("#tailor-flow");
  await flow.getByRole("button", { name: "Regenerate for this job" }).click();
  await expect(flow.locator(".rm-review")).toBeVisible({ timeout: 30_000 });
  return flow;
}

test("skills and bullets edited on the review reach the saved CV, its preview and DOCX", async ({ page }) => {
  const flow = await openReview(page, CV_ID);
  const skills = flow.getByTestId("review-skills");

  // Remove one profile skill, then add one of the candidate's own.
  await skills.getByRole("button", { name: "Remove Docker from this CV" }).click();
  await expect(skills.getByRole("button", { name: "Put Docker back" })).toBeVisible();
  const add = skills.getByLabel("Add a skill to this CV");
  await add.fill("react");
  await add.press("Enter");
  await expect(skills.getByRole("status")).toHaveText("react is already on this CV.");
  await add.fill("GraphQL");
  await skills.getByRole("button", { name: "Add", exact: true }).click();
  await expect(skills.locator(".rm-skill-chip--own")).toHaveText(/GraphQL/);

  // Rewrite the first AI bullet, then write a new one.
  const role = "Full-stack developer · Example Software";
  const first = flow.getByRole("textbox", { name: `Bullet 1 for ${role}` });
  await first.fill("Reworded by me: tested web platforms end to end.");
  await expect(flow.getByRole("button", { name: "Undo my edit" })).toBeVisible();
  await flow.getByRole("button", { name: "+ Add a bullet" }).click();
  const added = flow.locator("textarea.rm-bullet-item__text").last();
  await expect(added).toBeFocused();
  await added.fill(OWN_BULLET);

  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/(?!e2e-edits-cv)[^/]+\/preview/, { timeout: 30_000 });
  const newId = page.url().match(/\/tailor\/([^/]+)\/preview/)![1];

  const row = await e2eDb().tailoredResume.findUniqueOrThrow({ where: { id: newId } });
  const content = row.content as { skills: string[]; experience: { bullets: string[] }[] };
  expect(content.skills).toContain("GraphQL");
  expect(content.skills).not.toContain("Docker");
  expect(content.experience[0].bullets[0]).toBe("Reworded by me: tested web platforms end to end.");
  expect(content.experience[0].bullets.at(-1)).toBe(OWN_BULLET);
  expect(row.candidateEdits).toEqual({
    addedSkills: ["GraphQL"],
    removedSkills: ["Docker"],
    ownBullets: [
      {
        title: "Full-stack developer",
        employer: "Example Software",
        startedOn: null,
        bullets: ["Reworded by me: tested web platforms end to end.", OWN_BULLET],
      },
    ],
    ownSummary: null,
  });

  // The profile itself is unchanged: the edits are this CV's only.
  const version = await e2eDb().candidateProfileVersion.findUniqueOrThrow({ where: { id: versionId } });
  expect((version.content as typeof PROFILE).skills.map((s) => s.name)).toEqual(PROFILE.skills.map((s) => s.name));

  // The preview (what the PDF prints) and the DOCX show the edits.
  const cv = page.locator(".rm-cv, main").first();
  await expect(cv.getByText("GraphQL").first()).toBeVisible();
  await expect(cv.getByText(OWN_BULLET)).toBeVisible();
  const docx = await page.request.get(`/api/tailor/${newId}/docx`);
  expect(docx.status()).toBe(200);
  const { value: text } = await mammoth.extractRawText({ buffer: await docx.body() });
  expect(text).toContain("GraphQL");
  expect(text).toContain(OWN_BULLET);
  expect(text).not.toContain("Docker");
});

test("Regenerate brings back the saved CV's own skills and bullets", async ({ page }) => {
  const flow = await openReview(page, CV_EDITED_ID);
  const skills = flow.getByTestId("review-skills");
  await expect(skills.locator(".rm-skill-chip--own")).toHaveText(/GraphQL/);
  await expect(skills.getByRole("button", { name: "Put Docker back" })).toBeVisible();
  const role = "Full-stack developer · Example Software";
  await expect(flow.getByRole("textbox", { name: `Bullet 1 for ${role}` })).toHaveValue(OWN_BULLET);
  await expect(flow.getByRole("checkbox", { name: `Keep bullet 1 for ${role}` })).toBeChecked();
});

test("a save refused as written keeps the review and its edits open", async ({ page }) => {
  const flow = await openReview(page, CV_ID);
  await flow.getByRole("button", { name: "+ Add a bullet" }).click();
  await flow.locator("textarea.rm-bullet-item__text").last().fill(OWN_BULLET);
  await page.route("**/api/tailor/generate-confirm", (route) =>
    route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Shorten it." }) }),
  );
  await flow.getByRole("button", { name: "Confirm & save" }).click();
  await expect(flow.getByRole("alert").filter({ hasText: "Shorten it." })).toBeVisible();
  await expect(flow.locator("textarea.rm-bullet-item__text").last()).toHaveValue(OWN_BULLET);
});
