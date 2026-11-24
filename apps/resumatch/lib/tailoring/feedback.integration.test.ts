import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * #932 against a real database: one feedback row per preview and per CV,
 * deleted with its CV, never readable from another workspace. Guarded
 * behind RESUMATCH_TEST_DATABASE_URL like the other integration suites.
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("tailoring feedback storage (#932)", () => {
  let db: import("../db/generated").PrismaClient;
  const workspaces: string[] = [];

  beforeAll(async () => {
    db = (await import("../db/client")).getJobmatchDb();
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of workspaces) {
      await db.tailoredResume.deleteMany({ where: { workspaceId: id } });
      await db.targetJob.deleteMany({ where: { workspaceId: id } });
      await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId: id } } });
      await db.candidateProfile.deleteMany({ where: { workspaceId: id } });
      await db.workspace.deleteMany({ where: { id } });
    }
  });

  async function seed(label: string) {
    const { createVersion } = await import("../profile/versions");
    const ws = await db.workspace.create({ data: { platformUserId: `feedback-${label}-${Date.now()}` }, select: { id: true } });
    workspaces.push(ws.id);
    const version = await createVersion({
      workspaceId: ws.id,
      content: { headline: "Backend engineer", skills: [{ name: "TypeScript", rawLabel: null, yearsExperience: 5 }] },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    const job = await db.targetJob.create({
      data: { workspaceId: ws.id, sourceUrl: "https://example.test/j", rawText: "TypeScript.", status: "FETCHED" },
      select: { id: true },
    });
    return { workspaceId: ws.id, profileVersionId: version.id, targetJobId: job.id };
  }

  const cv = (ids: Awaited<ReturnType<typeof seed>>, previewId: string) => ({
    workspaceId: ids.workspaceId,
    profileVersionId: ids.profileVersionId,
    targetJobId: ids.targetJobId,
    content: { skills: ["TypeScript"], experience: [], education: [], certifications: [] },
    templateKey: "classic",
    promptVersion: "tailor_resume@9",
    modelVersion: "fixture-tailor-1",
    feedback: {
      create: {
        workspaceId: ids.workspaceId,
        previewId,
        feedbackVersion: "tailoring_feedback@1",
        original: { cv: null, coverLetter: null },
        decisions: [],
      },
    },
  });

  it("refuses a second record for the same preview, and the CV write fails with it", async () => {
    const ids = await seed("dup");
    const previewId = `prev-dup-${Date.now()}`;
    await db.tailoredResume.create({ data: cv(ids, previewId) });
    await expect(db.tailoredResume.create({ data: cv(ids, previewId) })).rejects.toMatchObject({ code: "P2002" });
    // Atomic: the failed second write left no CV behind either.
    expect(await db.tailoredResume.count({ where: { workspaceId: ids.workspaceId } })).toBe(1);
    expect(await db.tailoringFeedback.count({ where: { workspaceId: ids.workspaceId } })).toBe(1);
  });

  it("is deleted with its CV and scoped to its workspace", async () => {
    const mine = await seed("mine");
    const other = await seed("other");
    const saved = await db.tailoredResume.create({ data: cv(mine, `prev-mine-${Date.now()}`), select: { id: true } });
    expect(
      await db.tailoringFeedback.findFirst({ where: { tailoredResumeId: saved.id, workspaceId: other.workspaceId } }),
    ).toBeNull();
    await db.tailoredResume.delete({ where: { id: saved.id } });
    expect(await db.tailoringFeedback.count({ where: { tailoredResumeId: saved.id } })).toBe(0);
  });
});
