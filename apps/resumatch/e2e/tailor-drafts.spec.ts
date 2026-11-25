import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * Tailor drafts (lib/tailoring/drafts): a job that landed on /tailor, the
 * choices made on it, and the review with its edits survive a reload or
 * leaving the page; saving the CV closes the draft; other unfinished jobs
 * are listed with Resume and Discard; a link fetched recently is reused,
 * not fetched again. Fixture AI provider: no real AI call.
 */

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
  ],
};

const jobText = (title: string) => `${title}
We build web shops for small retailers and need someone who loves React.
Requirements:
- Experience with React and TypeScript
- Writing end-to-end tests with Playwright
- Clear written communication with the rest of the team`;

const NOTE = "Emphasize my testing work.";

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

const flowOf = (page: import("@playwright/test").Page) => page.locator("#tailor-flow").filter({ visible: true });

async function pasteJob(page: import("@playwright/test").Page, title: string) {
  const flow = flowOf(page);
  await flow.getByRole("button", { name: "Paste the description instead" }).click();
  await flow.getByPlaceholder("Paste the full job description here…").fill(jobText(title));
  await flow.getByRole("button", { name: "Use this text" }).click();
  await expect(flow.getByLabel("Anything you want AI to keep in mind? (optional)")).toBeVisible({ timeout: 30_000 });
}

test("the options card survives a reload and leaving the page", async ({ page }) => {
  await page.goto("/tailor");
  await pasteJob(page, "Frontend Developer");
  const flow = flowOf(page);
  // The draft is opened by the intake itself, before anything is typed.
  expect(await e2eDb().tailorDraft.count({ where: { workspaceId } })).toBe(1);
  await expect(page).toHaveURL(/\/tailor\?draft=/);

  await flow.getByLabel("Anything you want AI to keep in mind? (optional)").fill(NOTE);
  await flow.getByLabel("Also draft a cover letter for this job").check();
  await expect(flow.getByTestId("draft-status")).toHaveText("Progress saved. You can leave and come back.");

  await page.reload();
  await expect(flowOf(page).getByLabel("Anything you want AI to keep in mind? (optional)")).toHaveValue(NOTE);
  await expect(flowOf(page).getByLabel("Also draft a cover letter for this job")).toBeChecked();
  await expect(flowOf(page).getByTestId("draft-status")).toContainText("Picked up where you left off");

  // Leave through the app's own navigation, then come back to /tailor.
  await flowOf(page).getByLabel("Anything you want AI to keep in mind? (optional)").fill(`${NOTE} Keep it short.`);
  await page.goto("/applications");
  await page.goto("/tailor");
  await expect(flowOf(page).getByLabel("Anything you want AI to keep in mind? (optional)")).toHaveValue(`${NOTE} Keep it short.`);
  // Nothing was fetched or created again.
  expect(await e2eDb().targetJob.count({ where: { workspaceId } })).toBe(1);
});

test("the review with its edits survives a reload, and saving the CV closes the draft", async ({ page }) => {
  await page.goto("/tailor");
  await pasteJob(page, "Frontend Developer");
  const flow = flowOf(page);
  await flow.getByRole("button", { name: "Tailor my CV to this job" }).click();
  const headline = flow.locator("#rm-review-headline");
  await expect(headline).toBeVisible({ timeout: 30_000 });
  await headline.fill("My own headline for this job");
  await expect(flow.getByTestId("draft-status")).toHaveText("Progress saved. You can leave and come back.");
  const previews = await e2eDb().tailorPreview.count({ where: { workspaceId } });

  await page.reload();
  await expect(flowOf(page).locator("#rm-review-headline")).toHaveValue("My own headline for this job");
  // Resuming ran no new tailoring call.
  expect(await e2eDb().tailorPreview.count({ where: { workspaceId } })).toBe(previews);

  await flowOf(page).getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/, { timeout: 30_000 });
  const saved = await e2eDb().tailoredResume.findFirstOrThrow({ where: { workspaceId }, select: { content: true } });
  expect((saved.content as { headline: string }).headline).toBe("My own headline for this job");
  expect(await e2eDb().tailorDraft.count({ where: { workspaceId } })).toBe(0);

  await page.goto("/tailor");
  await expect(flowOf(page).getByTestId("draft-bar")).toHaveCount(0);
  await expect(flowOf(page).getByLabel("Anything you want AI to keep in mind? (optional)")).toHaveCount(0);
});

test("other unfinished jobs are listed with Resume and Discard; Start a new job opens an empty flow", async ({ page }) => {
  const prisma = e2eDb();
  for (const [index, title] of ["First Developer", "Second Developer"].entries()) {
    const job = await prisma.targetJob.create({
      data: { workspaceId, sourceUrl: "pasted://job-description", rawText: jobText(title), title, employer: "Example Shops", status: "FETCHED" },
    });
    const draft = await prisma.tailorDraft.create({ data: { workspaceId, targetJobId: job.id } });
    // Second Developer is the latest change.
    await prisma.$executeRaw`UPDATE "tailor_drafts" SET "updatedAt" = ${new Date(Date.now() - (2 - index) * 60_000)} WHERE "id" = ${draft.id}`;
  }

  await page.goto("/tailor");
  await expect(flowOf(page)).toContainText("Second Developer");
  const list = page.getByTestId("tailor-drafts").filter({ visible: true });
  await expect(list.locator(".rm-drafts__item")).toHaveCount(1);
  await expect(list).toContainText("First Developer");

  await list.getByRole("link", { name: "Resume" }).click();
  await expect(page).toHaveURL(/draft=/);
  await expect(flowOf(page)).toContainText("First Developer");
  await expect(page.getByTestId("tailor-drafts").filter({ visible: true })).toContainText("Second Developer");

  // Discard the one in the flow: it's gone, the other stays.
  await flowOf(page).getByTestId("draft-discard").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();
  await expect(flowOf(page).getByTestId("draft-bar")).toHaveCount(0);
  await expect
    .poll(async () => (await prisma.tailorDraft.findMany({ where: { workspaceId }, select: { targetJob: { select: { title: true } } } })).map((d) => d.targetJob.title))
    .toEqual(["Second Developer"]);
  // The job row itself stays.
  expect(await prisma.targetJob.count({ where: { workspaceId } })).toBe(2);

  await page.goto("/tailor?new=1");
  await expect(flowOf(page).getByTestId("draft-bar")).toHaveCount(0);
  await expect(page.getByTestId("tailor-drafts").filter({ visible: true })).toContainText("Second Developer");
});

test("a link fetched recently is reused instead of fetched again", async ({ page }) => {
  const url = "https://jobs.example.test/frontend-developer";
  const job = await e2eDb().targetJob.create({
    data: { workspaceId, sourceUrl: url, rawText: jobText("Frontend Developer"), title: "Frontend Developer", employer: "Example Shops", status: "FETCHED" },
  });
  let fetchRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/tailor/fetch-job")) fetchRequests += 1;
  });

  await page.goto("/tailor?new=1");
  const flow = flowOf(page);
  await flow.getByPlaceholder("https://company.example/careers/senior-engineer").fill(url);
  await flow.getByRole("button", { name: "Fetch job" }).click();
  await expect(flow.getByTestId("draft-status")).toContainText("You already fetched this link on");
  await expect(flow.getByRole("button", { name: "Fetch again" })).toBeVisible();
  expect(fetchRequests).toBe(1);
  expect(await e2eDb().targetJob.count({ where: { workspaceId } })).toBe(1);
  expect(await e2eDb().tailorDraft.findMany({ where: { workspaceId }, select: { targetJobId: true } })).toEqual([{ targetJobId: job.id }]);
});
