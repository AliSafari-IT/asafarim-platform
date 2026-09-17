import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * End-to-end tailoring pipeline test against a real database. Guarded
 * behind `RESUMATCH_TEST_DATABASE_URL` and named `*.integration.test.ts`,
 * mirroring the other integration suites in this app (e.g.
 * app/api/internal/ai-spend/route.integration.test.ts) — `pnpm test` never
 * touches a database. Run explicitly:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/tailoring/ai/generate.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("generateTailoredResume — end-to-end pipeline (fixture provider)", () => {
  let db: import("../../db/generated").PrismaClient;
  let generateTailoredResume: typeof import("./generate").generateTailoredResume;
  let createVersion: typeof import("../../profile/versions").createVersion;
  let confirmVersion: typeof import("../../profile/versions").confirmVersion;

  let workspaceId: string;
  let profileVersionId: string;
  let targetJobId: string;

  beforeAll(async () => {
    ({ generateTailoredResume } = await import("./generate"));
    ({ createVersion, confirmVersion } = await import("../../profile/versions"));
    db = (await import("../../db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `tailor-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const version = await createVersion({
      workspaceId,
      content: {
        headline: "Senior Backend Engineer",
        summary: "Builds payment platforms with TypeScript and PostgreSQL.",
        skills: [
          { name: "TypeScript", rawLabel: null, yearsExperience: 6 },
          { name: "PostgreSQL", rawLabel: null, yearsExperience: 5 },
        ],
        experience: [
          {
            title: "Senior Backend Engineer",
            employer: "Example Corp",
            startedOn: "2021-03",
            endedOn: null,
            isCurrent: true,
            summary: "Owned the payments API. Reduced latency by 40%.",
          },
        ],
      },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceId, version.id);
    profileVersionId = version.id;

    const targetJob = await db.targetJob.create({
      data: {
        workspaceId,
        sourceUrl: "https://example.test/jobs/1",
        rawText: "We need a backend engineer with TypeScript and PostgreSQL experience.",
        title: "Backend Engineer",
        employer: "Example Corp",
        status: "FETCHED",
      },
      select: { id: true },
    });
    targetJobId = targetJob.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.tailoredResume.deleteMany({ where: { workspaceId } });
    await db.targetJob.deleteMany({ where: { workspaceId } });
    await db.candidateProfileVersion.deleteMany({ where: { profile: { workspaceId } } });
    await db.candidateProfile.deleteMany({ where: { workspaceId } });
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("persists a TailoredResume with facts carried over verbatim and a ledger row recorded", async () => {
    const result = await generateTailoredResume(workspaceId, profileVersionId, targetJobId, {
      provider: "fixture",
    });

    expect(result.degraded).toBe(false);
    expect(result.content.experience[0]).toMatchObject({
      title: "Senior Backend Engineer",
      employer: "Example Corp",
      startedOn: "2021-03",
      isCurrent: true,
    });
    expect(result.content.skills).toEqual(expect.arrayContaining(["TypeScript", "PostgreSQL"]));

    const row = await db.tailoredResume.findUniqueOrThrow({ where: { id: result.id } });
    expect(row.workspaceId).toBe(workspaceId);
    expect(row.targetJobId).toBe(targetJobId);
    expect(row.degraded).toBe(false);

    const ledger = await db.aiUsageLedger.findMany({ where: { workspaceId, kind: "tailor" } });
    expect(ledger).toHaveLength(1);
  });
});
