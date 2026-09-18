import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * GDPR export/erase coverage for TargetJob/TailoredResume, against a real
 * database. Guarded behind `RESUMATCH_TEST_DATABASE_URL`, mirroring the
 * other integration suites in this app — `pnpm test` never touches a
 * database. Run explicitly:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/profile/dataRights.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("data rights — TargetJob/TailoredResume coverage", () => {
  let db: import("../db/generated").PrismaClient;
  let exportWorkspaceData: typeof import("./dataRights").exportWorkspaceData;
  let eraseWorkspaceData: typeof import("./dataRights").eraseWorkspaceData;
  let createVersion: typeof import("./versions").createVersion;
  let confirmVersion: typeof import("./versions").confirmVersion;

  let workspaceId: string;

  beforeAll(async () => {
    ({ exportWorkspaceData, eraseWorkspaceData } = await import("./dataRights"));
    ({ createVersion, confirmVersion } = await import("./versions"));
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.tailoredResume.deleteMany({ where: { workspaceId } });
    await db.targetJob.deleteMany({ where: { workspaceId } });
    await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId } } });
    await db.candidateProfile.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("includes target jobs and tailored resumes in the export, then erases both", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `datarights-tailor-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const version = await createVersion({
      workspaceId,
      content: { headline: "Backend engineer", skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }] },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceId, version.id);

    const targetJob = await db.targetJob.create({
      data: {
        workspaceId,
        sourceUrl: "https://example.test/jobs/1",
        rawText: "We need a TypeScript engineer.",
        title: "Backend Engineer",
        employer: "Example Corp",
        status: "FETCHED",
      },
      select: { id: true },
    });

    await db.tailoredResume.create({
      data: {
        workspaceId,
        profileVersionId: version.id,
        targetJobId: targetJob.id,
        content: { skills: ["TypeScript"], experience: [], education: [], certifications: [] },
        templateKey: "classic",
        promptVersion: "tailor_resume@1",
        modelVersion: "fixture-tailor-1",
        degraded: false,
      },
    });

    const exported = await exportWorkspaceData(workspaceId);
    expect(exported).not.toBeNull();
    expect(exported!.targetJobs).toHaveLength(1);
    expect(exported!.targetJobs[0]).toMatchObject({ sourceUrl: "https://example.test/jobs/1", title: "Backend Engineer" });
    expect(exported!.tailoredResumes).toHaveLength(1);
    expect(exported!.tailoredResumes[0]).toMatchObject({ targetJobId: targetJob.id, templateKey: "classic" });

    const erasure = await eraseWorkspaceData(workspaceId);
    expect(erasure.targetJobsDeleted).toBe(1);
    expect(erasure.tailoredResumesDeleted).toBe(1);

    const remainingJobs = await db.targetJob.count({ where: { workspaceId } });
    const remainingResumes = await db.tailoredResume.count({ where: { workspaceId } });
    expect(remainingJobs).toBe(0);
    expect(remainingResumes).toBe(0);
  });
});
