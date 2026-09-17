import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * JM-043 end-to-end pipeline tests against a real database.
 *
 * Guarded behind `JOBMATCH_TEST_DATABASE_URL` and named
 * `*.integration.test.ts`, mirroring matchRunCache.integration.test.ts and
 * embeddingCache.integration.test.ts — `pnpm test` never touches a
 * database. Run explicitly:
 *
 *   JOBMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/jobmatch exec vitest run lib/matching/ai/evaluate.integration.test.ts
 *
 * Requires the match_run / ai_usage_ledger tables (JM-047's migration,
 * already applied) on that database.
 */

const TEST_DB = process.env.JOBMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.JOBMATCH_DATABASE_URL = TEST_DB;

describe.skipIf(!TEST_DB)("evaluateMatch — end-to-end pipeline (fixture provider)", () => {
  let db: import("../../db/generated").PrismaClient;
  let evaluateMatch: typeof import("./evaluate").evaluateMatch;
  let createVersion: typeof import("../../profile/versions").createVersion;
  let confirmVersion: typeof import("../../profile/versions").confirmVersion;

  let workspaceId: string;
  let profileVersionId: string;
  let postingId: string;
  let sourceId: string;

  beforeAll(async () => {
    ({ evaluateMatch } = await import("./evaluate"));
    ({ createVersion, confirmVersion } = await import("../../profile/versions"));
    db = (await import("../../db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `jm043-test-${Date.now()}` },
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
      },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceId, version.id);
    profileVersionId = version.id;

    const source = await db.jobSource.create({
      data: {
        key: `jm043-test-source-${Date.now()}`,
        name: "JM-043 test source",
        kind: "JSON_FEED",
        endpoint: "https://example.test/feed",
      },
      select: { id: true },
    });
    sourceId = source.id;

    const posting = await db.jobPosting.create({
      data: {
        sourceId,
        externalId: `jm043-test-posting-${Date.now()}`,
        canonicalUrl: "https://example.test/jobs/1",
        title: "Backend Engineer",
        employer: "Example Corp",
        employerKey: "example corp",
        description: "We need a backend engineer with TypeScript and PostgreSQL experience.",
        skillsRaw: ["TypeScript", "PostgreSQL"],
        contentHash: `jm043-hash-${Date.now()}-1`,
        canonicalKey: `jm043-canonical-${Date.now()}-1`,
        normalizerVersion: "test-1",
      },
      select: { id: true },
    });
    postingId = posting.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.matchRun.deleteMany({ where: { workspaceId } });
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
    if (postingId) await db.jobPosting.deleteMany({ where: { id: postingId } });
    if (sourceId) await db.jobSource.deleteMany({ where: { id: sourceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("runs the full pipeline on the fixture provider and writes a non-degraded MatchRun row", async () => {
    const result = await evaluateMatch(workspaceId, profileVersionId, postingId, { provider: "fixture" });

    expect(result.degraded).toBe(false);
    expect(result.promptVersion).toBe("match_evaluate@1");
    expect(result.explanation.length).toBeGreaterThan(0);

    const row = await db.matchRun.findFirst({ where: { workspaceId, postingId } });
    expect(row).not.toBeNull();
    expect(row?.degraded).toBe(false);
  });

  it("a second call for the same key is a cache hit — zero additional MatchRun rows", async () => {
    await evaluateMatch(workspaceId, profileVersionId, postingId, { provider: "fixture" });
    const before = await db.matchRun.count({ where: { workspaceId, postingId } });

    const result = await evaluateMatch(workspaceId, profileVersionId, postingId, { provider: "fixture" });
    const after = await db.matchRun.count({ where: { workspaceId, postingId } });

    expect(after).toBe(before);
    expect(result.degraded).toBe(false);
  });

  it("budget exhaustion produces a degraded result rather than an escaping exception", async () => {
    const { recordUsage } = await import("./quota");
    const { getEnv } = await import("../../env");
    const budget = getEnv().aiMonthlyBudgetUsd;
    await recordUsage({
      workspaceId,
      kind: "evaluate",
      provider: "fixture",
      model: "fixture-eval-1",
      costUsd: budget + 5,
    });

    // A different posting id keeps this out of the earlier cache hit.
    const posting = await db.jobPosting.create({
      data: {
        sourceId,
        externalId: `jm043-budget-test-${Date.now()}`,
        canonicalUrl: "https://example.test/jobs/2",
        title: "Frontend Engineer",
        employer: "Example Corp",
        employerKey: "example corp",
        description: "React and CSS role.",
        skillsRaw: ["React"],
        contentHash: `jm043-hash-${Date.now()}-2`,
        canonicalKey: `jm043-canonical-${Date.now()}-2`,
        normalizerVersion: "test-1",
      },
      select: { id: true },
    });

    await expect(
      evaluateMatch(workspaceId, profileVersionId, posting.id, { provider: "fixture" }),
    ).resolves.toMatchObject({ degraded: true, confidence: 0 });

    await db.jobPosting.deleteMany({ where: { id: posting.id } });
    await db.matchRun.deleteMany({ where: { workspaceId, postingId: posting.id } });
  });
});
