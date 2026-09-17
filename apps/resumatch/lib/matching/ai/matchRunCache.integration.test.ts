import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDegradedMatchResult, type MatchResult } from "../contract";

/**
 * JM-047 cache-round-trip and GDPR-erasure behaviour against a real
 * database. Guarded behind `JOBMATCH_TEST_DATABASE_URL` and named
 * `*.integration.test.ts`, mirroring
 * lib/matching/ai/embeddingCache.integration.test.ts — `pnpm test` never
 * touches a database, and the dev database must never be a test target
 * (docs/threat-model.md). Run explicitly against a throwaway database:
 *
 *   JOBMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/jobmatch exec vitest run lib/matching/ai/matchRunCache.integration.test.ts
 *
 * Requires this issue's migration (match_run + ai_usage_ledger) to already
 * be applied to that database.
 */

const TEST_DB = process.env.JOBMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.JOBMATCH_DATABASE_URL = TEST_DB;

function fakeResult(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    contractVersion: "1.0.0",
    suitabilityScore: 0.8,
    confidence: 0.7,
    matchingSkills: ["TypeScript"],
    missingSkills: [],
    uncertainRequirements: [],
    explanation: [
      { profileField: "skills[0].name", postingRequirement: "TypeScript", note: "Direct match." },
    ],
    recommendedAction: "worth_applying",
    embeddingModelVersion: "fixture-1",
    evaluationModelVersion: "fixture-eval-1",
    promptVersion: "match-eval-1",
    degraded: false,
    ...overrides,
  };
}

describe.skipIf(!TEST_DB)("MatchRun cache + erasure — database flow", () => {
  let db: import("../../db/generated").PrismaClient;
  let getCachedMatchRun: typeof import("./matchRunCache").getCachedMatchRun;
  let recordMatchRun: typeof import("./matchRunCache").recordMatchRun;
  let assertCanRunProviderCall: typeof import("./quota").assertCanRunProviderCall;
  let recordUsage: typeof import("./quota").recordUsage;
  let QuotaExceededError: typeof import("./quota").QuotaExceededError;
  let runOrDegrade: typeof import("./degraded").runOrDegrade;
  let eraseWorkspaceData: typeof import("../../profile/dataRights").eraseWorkspaceData;
  let createVersion: typeof import("../../profile/versions").createVersion;
  let confirmVersion: typeof import("../../profile/versions").confirmVersion;

  let workspaceId: string;
  let profileVersionId: string;
  const postingId = "posting-jm047-test";

  beforeAll(async () => {
    ({ getCachedMatchRun, recordMatchRun } = await import("./matchRunCache"));
    ({ assertCanRunProviderCall, recordUsage, QuotaExceededError } = await import("./quota"));
    ({ runOrDegrade } = await import("./degraded"));
    ({ eraseWorkspaceData } = await import("../../profile/dataRights"));
    ({ createVersion, confirmVersion } = await import("../../profile/versions"));
    db = (await import("../../db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `jm047-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    const version = await createVersion({
      workspaceId,
      content: { headline: "Backend Engineer" },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceId, version.id);
    profileVersionId = version.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.matchRun.deleteMany({ where: { workspaceId } });
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("is a miss before anything is recorded", async () => {
    const key = {
      workspaceId,
      profileVersionId,
      postingId,
      promptVersion: "match-eval-1",
      evaluationModelVersion: "fixture-eval-1",
    };
    expect(await getCachedMatchRun(key)).toBeNull();
  });

  it("acceptance: a second lookup of the same key makes zero provider calls", async () => {
    const key = {
      workspaceId,
      profileVersionId,
      postingId,
      promptVersion: "match-eval-1",
      evaluationModelVersion: "fixture-eval-1",
    };
    const result = fakeResult();
    await recordMatchRun(key, result, 0.002);

    let calls = 0;
    async function fakeEvaluate(): Promise<MatchResult> {
      const cached = await getCachedMatchRun(key);
      if (cached) return cached;
      calls += 1; // would be a real provider call in JM-043
      return result;
    }

    const first = await fakeEvaluate();
    const second = await fakeEvaluate();
    expect(first).toEqual(result);
    expect(second).toEqual(result);
    expect(calls).toBe(0); // both lookups hit the cache recorded above
  });

  it("recordMatchRun upserts on the same key rather than erroring", async () => {
    const key = {
      workspaceId,
      profileVersionId,
      postingId: `${postingId}-upsert`,
      promptVersion: "match-eval-1",
      evaluationModelVersion: "fixture-eval-1",
    };
    await recordMatchRun(key, fakeResult({ suitabilityScore: 0.5 }), 0.001);
    await recordMatchRun(key, fakeResult({ suitabilityScore: 0.9 }), 0.001);

    const cached = await getCachedMatchRun(key);
    expect(cached?.suitabilityScore).toBe(0.9);

    const rows = await db.matchRun.count({ where: { workspaceId, postingId: key.postingId } });
    expect(rows).toBe(1);
  });

  it("budget exhaustion throws QuotaExceededError, never a fabricated success", async () => {
    // Drive this workspace's month-to-date spend at/above whatever
    // JOBMATCH_AI_MONTHLY_BUDGET_USD resolves to in this test run, then
    // assert the guard refuses rather than silently proceeding.
    const { getEnv } = await import("../../env");
    const budget = getEnv().aiMonthlyBudgetUsd;
    await recordUsage({
      workspaceId,
      kind: "evaluate",
      provider: "fixture",
      model: "fixture-eval-1",
      costUsd: budget + 1,
    });

    await expect(assertCanRunProviderCall(workspaceId, "evaluate")).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it("runOrDegrade turns a budget-exhaustion exception into an honest degraded MatchResult", async () => {
    async function overBudgetEvaluate(): Promise<MatchResult> {
      await assertCanRunProviderCall(workspaceId, "evaluate"); // throws — budget spent above
      throw new Error("unreachable");
    }

    const result = await runOrDegrade("match-eval-1", "evaluate", overBudgetEvaluate);
    expect(result).toEqual(buildDegradedMatchResult("match-eval-1"));
    expect(result.degraded).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.explanation).toHaveLength(0);
  });

  it("erasing a candidate removes their MatchRun rows", async () => {
    const key = {
      workspaceId,
      profileVersionId,
      postingId: `${postingId}-erasure`,
      promptVersion: "match-eval-1",
      evaluationModelVersion: "fixture-eval-1",
    };
    await recordMatchRun(key, fakeResult(), 0.001);

    const before = await db.matchRun.count({ where: { workspaceId } });
    expect(before).toBeGreaterThan(0);

    const result = await eraseWorkspaceData(workspaceId);
    expect(result.matchRunsDeleted).toBeGreaterThan(0);

    const after = await db.matchRun.count({ where: { workspaceId } });
    expect(after).toBe(0);

    // AiUsageLedger rows for the workspace deliberately survive erasure
    // (see dataRights.ts's comment on why) — assert that stays true rather
    // than silently regressing.
    const ledgerAfter = await db.aiUsageLedger.count({ where: { workspaceId } });
    expect(ledgerAfter).toBeGreaterThan(0);

    // Recreate the profile so afterAll's cleanup has a consistent shape
    // regardless of test order (erase deleted the CandidateProfile row).
    const version = await createVersion({
      workspaceId,
      content: { headline: "Backend Engineer" },
      origin: "MANUAL",
      extractorName: "test",
      extractorVersion: "1",
    });
    await confirmVersion(workspaceId, version.id);
  });
});
