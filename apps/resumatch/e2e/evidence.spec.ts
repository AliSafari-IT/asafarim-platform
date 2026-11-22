import { E2E_PLATFORM_USER_ID, e2eDb, expect, test } from "./fixtures";

/**
 * #929 background evidence: add → confirm → use, on desktop and phone, with
 * the keyboard where it matters. A draft is never used; a confirmed item for
 * this application reaches the run and its revision is recorded on the
 * saved CV; editing adds a revision without touching the saved CV's
 * lineage. Fixture AI provider: no real AI call.
 */

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
  return { workspaceId: workspace.id };
}

let workspaceId = "";
test.beforeEach(async () => {
  ({ workspaceId } = await seed());
});

async function openJob(page: import("@playwright/test").Page) {
  await page.goto("/tailor");
  await page.getByRole("button", { name: "Paste the description instead" }).click();
  await page.getByPlaceholder("Paste the full job description here…").fill(JOB_TEXT);
  await page.getByRole("button", { name: "Use this text" }).click();
  const panel = page.getByTestId("evidence-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  return panel;
}

test("add → confirm → use: only confirmed evidence for this application reaches the run", async ({ page }) => {
  const panel = await openJob(page);
  // Open the panel from the keyboard.
  await panel.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Add evidence" })).toBeVisible();

  // A draft first: saved, shown, not used.
  await panel.getByRole("button", { name: "Add evidence" }).click();
  const form = panel.getByRole("form", { name: "Add evidence" });
  await form.getByLabel("Kind").selectOption("PROJECT");
  await form.getByLabel("Title").fill("Design system rollout");
  await form.getByLabel("What happened").fill("Moved four React apps onto one shared component library.");
  await expect(form.getByLabel("Only this application")).toBeChecked();
  await form.getByRole("button", { name: "Save as draft" }).click();
  await expect(panel.getByText("Saved as a draft. Confirm it to use it.")).toBeVisible();
  await expect(panel.getByText("Draft · not used until you confirm it")).toBeVisible();
  await expect(panel.locator("summary")).toContainText("(0 used)");

  // Contact details are refused, and the form keeps the text to fix it.
  await panel.getByRole("button", { name: "Add evidence" }).click();
  const second = panel.getByRole("form", { name: "Add evidence" });
  await second.getByLabel("Kind").selectOption("ACHIEVEMENT");
  await second.getByLabel("Title").fill("Faster test runs");
  await second.getByLabel("What happened").fill("Cut the Playwright suite from 20 to 8 minutes. Mail me at jordan@example.test");
  await second.getByLabel("Role it belongs to").selectOption({ label: "Full-stack developer · Example Software" });
  await second.getByRole("button", { name: "Save and confirm" }).click();
  await expect(panel.getByText(/Leave out email addresses and phone numbers\. They are added/)).toBeVisible();
  await second.getByLabel("What happened").fill("Cut the Playwright suite from 20 to 8 minutes.");
  await second.getByRole("button", { name: "Save and confirm" }).click();
  await expect(panel.getByText("Saved and confirmed. It will be used the next time you generate.")).toBeVisible();
  await expect(panel.locator("summary")).toContainText("(1 used)");

  // Confirm the draft from its card.
  const draft = panel.getByTestId("evidence-item").filter({ hasText: "Design system rollout" });
  await draft.getByRole("button", { name: "Confirm" }).click();
  await expect(panel.locator("summary")).toContainText("(2 used)");

  // Generate and save: the run used both, and the CV records their revisions.
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.getByTestId("evidence-review-note")).toHaveText("Generated with 2 confirmed evidence item(s).", { timeout: 30_000 });
  await page.getByRole("button", { name: "Confirm & save" }).click();
  await page.waitForURL(/\/tailor\/[^/]+\/preview/, { timeout: 30_000 });

  const db = e2eDb();
  const revisions = await db.candidateEvidenceRevision.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
  expect(revisions.map((r) => r.status)).toEqual(["CONFIRMED", "CONFIRMED"]);
  const saved = await db.tailoredResume.findFirstOrThrow({ where: { workspaceId } });
  const context = saved.tailoringContext as { evidenceRevisionIds: string[] };
  expect([...context.evidenceRevisionIds].sort()).toEqual(revisions.map((r) => r.id).sort());
  const evidence = await db.candidateEvidence.findMany({ where: { workspaceId } });
  expect(evidence.every((e) => e.scope === "APPLICATION" && e.targetJobId === saved.targetJobId)).toBe(true);
});

test("an edit adds a revision and keeps the earlier one, and background is an explicit choice", async ({ page }) => {
  const panel = await openJob(page);
  await panel.locator("summary").click();
  await panel.getByRole("button", { name: "Add evidence" }).click();
  const form = panel.getByRole("form", { name: "Add evidence" });
  await form.getByLabel("Title").fill("On-call lead");
  await form.getByLabel("What happened").fill("Ran the weekly on-call rota for the web team.");
  await form.getByRole("button", { name: "Save and confirm" }).click();
  await expect(panel.locator("summary")).toContainText("(1 used)");

  const item = panel.getByTestId("evidence-item").filter({ hasText: "On-call lead" });
  await item.getByRole("button", { name: "Use for all applications" }).click();
  await expect(panel.getByText("Kept for all your applications.")).toBeVisible();
  const db = e2eDb();
  const [stored] = await db.candidateEvidence.findMany({ where: { workspaceId }, include: { revisions: true } });
  expect(stored!.scope).toBe("BACKGROUND");
  expect(stored!.targetJobId).toBeNull();
  expect(stored!.revisions).toHaveLength(1);
  const firstRevision = stored!.revisions[0]!.id;

  // Edit it: a second revision, confirmed again.
  await item.getByRole("button", { name: "Edit" }).click();
  const edit = panel.getByRole("form", { name: "Edit evidence" });
  await edit.getByLabel("What happened").fill("Ran the weekly on-call rota for a team of six.");
  await edit.getByRole("button", { name: "Save and confirm" }).click();
  await expect(panel.getByText("Saved and confirmed. It will be used the next time you generate.")).toBeVisible();
  const revisions = await db.candidateEvidenceRevision.findMany({ where: { evidenceId: stored!.id }, orderBy: { revisionNumber: "asc" } });
  expect(revisions.map((r) => r.detail)).toEqual([
    "Ran the weekly on-call rota for the web team.",
    "Ran the weekly on-call rota for a team of six.",
  ]);
  expect(revisions[0]!.id).toBe(firstRevision);

  // Cancel leaves everything as it was.
  await item.getByRole("button", { name: "Edit" }).click();
  await panel.getByRole("form", { name: "Edit evidence" }).getByLabel("Title").fill("Changed my mind");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByRole("form")).toHaveCount(0);
  expect(await db.candidateEvidenceRevision.count({ where: { evidenceId: stored!.id } })).toBe(2);

  // Delete, through the styled dialog.
  await item.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(panel.getByText("Deleted.")).toBeVisible();
  expect(await db.candidateEvidence.count({ where: { workspaceId } })).toBe(0);
});

test("a review can't be saved after its evidence changed", async ({ page }) => {
  const panel = await openJob(page);
  await panel.locator("summary").click();
  await page.getByRole("button", { name: "Tailor my CV to this job" }).click();
  await expect(page.locator(".rm-review")).toBeVisible({ timeout: 30_000 });

  // Confirmed evidence added elsewhere after "Generate".
  const job = await e2eDb().targetJob.findFirstOrThrow({ where: { workspaceId } });
  await e2eDb().candidateEvidence.create({
    data: {
      workspaceId,
      scope: "APPLICATION",
      targetJobId: job.id,
      revisions: { create: { workspaceId, revisionNumber: 1, kind: "PROJECT", title: "Late", detail: "Added later.", status: "CONFIRMED", confirmedAt: new Date() } },
    },
  });
  await page.getByRole("button", { name: "Confirm & save" }).click();
  await expect(page.getByText("Your evidence changed after these suggestions were made. Generate them again.")).toBeVisible();
  await expect(page.locator(".rm-review")).toBeVisible();
  expect(await e2eDb().tailoredResume.count({ where: { workspaceId } })).toBe(0);
});
