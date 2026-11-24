import { E2E_PLATFORM_USER_ID, e2eDb, expect, signInAs, test } from "./fixtures";

/**
 * #942: "Download everything" in account A, then upload that file on
 * /profile in account B. The confirmed profile comes over exactly, as an
 * unconfirmed version of B's own; nothing goes through CV extraction.
 * All data is synthetic.
 */

const SOURCE_USER = "e2e-resumatch-import-source";

const confirmedContent = {
  contractVersion: "1.0.0",
  fullName: "Jordan Example",
  email: "jordan@example.test",
  headline: "Full-stack developer",
  summary: "Builds and tests web applications, with a focus on reliable data and clear interfaces.",
  links: [
    { kind: "github", label: null, url: "https://github.example.test/jordan" },
    { kind: "product", label: "Example App", url: "https://app.example.test/" },
  ],
  languages: [{ code: "en", label: "English", proficiency: "professional" }],
  skills: [
    { name: "TypeScript", category: "Languages" },
    { name: "Playwright", category: "Testing" },
    { name: "PostgreSQL" },
  ],
  experience: [
    { title: "QA engineer", employer: "Example Renovations", startedOn: "2025-02", isCurrent: true, summary: "Role-based end-to-end testing." },
    { title: "Developer", employer: "Example Hydrology", startedOn: "2015-01", endedOn: "2024-12" },
  ],
  education: [
    { qualification: "MSc Hydrology", institution: "Example University", completedOn: "2004" },
    { qualification: "BSc Civil Engineering", institution: "Other University", completedOn: "2001" },
  ],
};

async function seed() {
  const prisma = e2eDb();
  await prisma.workspace.deleteMany({ where: { platformUserId: { in: [SOURCE_USER, E2E_PLATFORM_USER_ID] } } });

  // Account A: three versions, the middle one confirmed, plus a job.
  const source = await prisma.workspace.create({ data: { platformUserId: SOURCE_USER } });
  const profile = await prisma.candidateProfile.create({ data: { workspaceId: source.id } });
  const make = (versionNumber: number, content: object) =>
    prisma.candidateProfileVersion.create({
      data: { profileId: profile.id, versionNumber, origin: "MANUAL", extractorName: "manual", extractorVersion: "1", content },
    });
  await make(1, { contractVersion: "1.0.0", headline: "First draft" });
  const confirmed = await make(2, confirmedContent);
  await make(3, { contractVersion: "1.0.0", headline: "Newer unconfirmed draft" });
  await prisma.candidateProfile.update({ where: { id: profile.id }, data: { confirmedVersionId: confirmed.id } });
  await prisma.targetJob.create({
    data: { workspaceId: source.id, sourceUrl: "https://jobs.example.test/qa", title: "QA lead", status: "FETCHED", rawText: "Job advert text" },
  });

  // Account B: its own confirmed profile.
  const dest = await prisma.workspace.create({ data: { platformUserId: E2E_PLATFORM_USER_ID } });
  const destProfile = await prisma.candidateProfile.create({ data: { workspaceId: dest.id } });
  const own = await prisma.candidateProfileVersion.create({
    data: {
      profileId: destProfile.id,
      versionNumber: 1,
      origin: "MANUAL",
      extractorName: "manual",
      extractorVersion: "1",
      content: { contractVersion: "1.0.0", fullName: "Sam Other", headline: "B's own headline" },
    },
  });
  await prisma.candidateProfile.update({ where: { id: destProfile.id }, data: { confirmedVersionId: own.id } });
  return { destId: dest.id, ownVersionId: own.id };
}

test("an export from account A restores its confirmed profile in account B", async ({ page, context, baseURL }) => {
  const { destId, ownVersionId } = await seed();

  // Account A downloads everything.
  await signInAs(context, baseURL, SOURCE_USER);
  const download = await page.request.get("/api/data-rights");
  expect(download.ok()).toBe(true);
  const exportJson = await download.text();
  expect(JSON.parse(exportJson).format).toBe("resumatch-candidate-export");

  // Account B uploads it on the profile page.
  await signInAs(context, baseURL, E2E_PLATFORM_USER_ID);
  await page.goto("/profile");
  await expect(page.getByRole("textbox", { name: "Headline" })).toHaveValue("B's own headline");
  const panel = page.getByRole("region", { name: "Import a profile from a ResuMatch export" });
  // Retried: a file set before the page hydrates has no change handler yet.
  await expect(async () => {
    await page.locator("input.jm-dropzone__input").setInputFiles({
      name: "resumatch-export.json",
      mimeType: "application/json",
      buffer: Buffer.from(exportJson),
    });
    await expect(panel).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(panel.getByText("Profile version 2 from the export, the one confirmed there.")).toBeVisible();
  await expect(panel.locator(".rx-import__count", { hasText: "Experience" })).toContainText("2 of 2");
  await expect(panel.locator(".rx-import__count", { hasText: "Skills" })).toContainText("3 of 3");
  await expect(panel.locator(".rx-import__count", { hasText: "Links" })).toContainText("2 of 2");
  await expect(panel.getByText("Other profile versions (2)")).toBeVisible();
  await expect(panel.getByText("Jobs (1)")).toBeVisible();

  // B already has a profile: no import without an explicit yes.
  const importButton = panel.getByRole("button", { name: "Import profile" });
  await expect(importButton).toBeDisabled();
  await panel.getByLabel("Yes, replace the profile shown below with the imported one").check();
  await importButton.click();
  await expect(page.getByText("Profile imported as version 2. Check it below, then Save and confirm.")).toBeVisible();

  // The form shows the imported profile, with employers in place.
  await expect(page.getByRole("textbox", { name: "Headline" })).toHaveValue("Full-stack developer");
  await expect(page.getByText("Example Hydrology").or(page.locator('input[value="Example Hydrology"]')).first()).toBeVisible();

  // Stored as B's own unconfirmed version 2, identical to A's confirmed one.
  const prisma = e2eDb();
  const destProfile = await prisma.candidateProfile.findFirstOrThrow({
    where: { workspaceId: destId },
    include: { versions: { orderBy: { versionNumber: "asc" } } },
  });
  expect(destProfile.versions).toHaveLength(2);
  expect(destProfile.confirmedVersionId).toBe(ownVersionId);
  const imported = destProfile.versions[1];
  expect(imported.extractorName).toBe("resumatch-export-import");
  expect(imported.documentId).toBeNull();
  const content = imported.content as typeof confirmedContent;
  expect(content.experience.map((e) => e.employer)).toEqual(["Example Renovations", "Example Hydrology"]);
  expect(content.education.map((e) => e.institution)).toEqual(["Example University", "Other University"]);
  expect(content.skills.map((s) => s.name)).toEqual(["TypeScript", "Playwright", "PostgreSQL"]);
  expect(content.links).toHaveLength(2);
  // Nothing else came over, and no CV document was stored.
  expect(await prisma.targetJob.count({ where: { workspaceId: destId } })).toBe(0);
  expect(await prisma.candidateDocument.count({ where: { workspaceId: destId } })).toBe(0);
});

test("a large export, renamed to .txt, still opens the import (above the 10 MB CV limit)", async ({ page }) => {
  await seed();
  // A synthetic 12 MB archive: the size comes from job text, which is never imported.
  const archive = {
    exportedAt: "2026-11-24T09:00:00.000Z",
    format: "resumatch-candidate-export",
    formatVersion: "1.0.0",
    workspace: { id: "source-ws", createdAt: "2026-01-01T00:00:00.000Z" },
    profile: {
      confirmedVersionId: "src-1",
      versions: [{ id: "src-1", versionNumber: 1, origin: "MANUAL", createdAt: "2026-11-01T00:00:00.000Z", content: confirmedContent }],
    },
    targetJobs: [{ id: "j1", rawText: "x".repeat(12 * 1024 * 1024) }],
  };
  const buffer = Buffer.from(JSON.stringify(archive, null, 2));
  expect(buffer.length).toBeGreaterThan(12 * 1024 * 1024);

  await page.goto("/profile");
  await expect(page.getByRole("textbox", { name: "Headline" })).toHaveValue("B's own headline");
  const panel = page.getByRole("region", { name: "Import a profile from a ResuMatch export" });
  await expect(async () => {
    await page.locator("input.jm-dropzone__input").setInputFiles({ name: "backup.txt", mimeType: "text/plain", buffer });
    await expect(panel).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(panel.getByText("Profile version 1 from the export, the one confirmed there.")).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".rx-import__count", { hasText: "Experience" })).toContainText("2 of 2");
  await expect(panel.getByText("Jobs (1)")).toBeVisible();
});
