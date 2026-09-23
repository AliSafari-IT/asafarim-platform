import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The budget under test comes from RESUMATCH_AI_MONTHLY_BUDGET_USD. Pin the
// admin-console override layer to "no override" so a live local Admin (or an
// exported INTERNAL_API_SECRET) can never change what these tests assert.
vi.mock("../../platform-settings", () => ({
  getPlatformSetting: async <T,>(_key: string, fallback: T) => fallback,
}));

/**
 * Regression coverage for issue #526: generate-preview's tailor and
 * cover-letter provider calls must not both pass assertCanRunProviderCall
 * against the same stale pre-spend total. The route fix serializes the two
 * calls; this test exercises quota.ts directly to prove that serializing
 * (checking again only after the first call's usage is recorded) keeps a
 * workspace from spending past its budget, the way running both checks
 * concurrently against the same read would not.
 *
 * Guarded behind RESUMATCH_TEST_DATABASE_URL, mirroring the other
 * integration suites in this app:
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run lib/tailoring/ai/quota.race.integration.test.ts
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) {
  process.env.RESUMATCH_DATABASE_URL = TEST_DB;
  // quota.ts reads the budget from getEnv(), which caches on first call —
  // set it before any import in this file touches lib/env.ts.
  process.env.RESUMATCH_AI_MONTHLY_BUDGET_USD = "20";
}

describe.skipIf(!TEST_DB)("generate-preview budget serialization (quota.ts)", () => {
  let db: import("../../db/generated").PrismaClient;
  let assertCanRunProviderCall: typeof import("./quota").assertCanRunProviderCall;
  let recordUsage: typeof import("./quota").recordUsage;
  let QuotaExceededError: typeof import("./quota").QuotaExceededError;

  let workspaceId: string;

  beforeAll(async () => {
    ({ assertCanRunProviderCall, recordUsage, QuotaExceededError } = await import("./quota"));
    db = (await import("../../db/client")).getJobmatchDb();
  });

  afterEach(async () => {
    if (!db || !workspaceId) return;
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    if (!db || !workspaceId) return;
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("a second, serialized check after the first call's usage is recorded rejects a workspace already at budget", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `quota-race-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    // Just under the $20 budget: one more $2 call tips it over.
    await db.aiUsageLedger.create({
      data: { workspaceId, kind: "tailor", provider: "fixture", model: "fixture-1", costUsd: 19 },
    });

    // The tailor call's own check-then-record, exactly as generate-preview
    // now does it before the cover-letter call starts.
    await assertCanRunProviderCall(workspaceId, "tailor");
    await recordUsage({ workspaceId, kind: "tailor", provider: "fixture", model: "fixture-1", costUsd: 2 });

    // The cover-letter call's check now runs against the up-to-date total
    // ($21), not the stale pre-spend total both calls would have read under
    // Promise.all ($19) — and correctly rejects.
    await expect(assertCanRunProviderCall(workspaceId, "cover_letter")).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it("two checks against the same stale total would both pass (what Promise.all used to allow)", async () => {
    const ws = await db.workspace.create({
      data: { platformUserId: `quota-race-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    await db.aiUsageLedger.create({
      data: { workspaceId, kind: "tailor", provider: "fixture", model: "fixture-1", costUsd: 19 },
    });

    // Both checks run before either call records usage — the concurrent
    // shape generate-preview used to have. Demonstrates the check alone,
    // read in isolation, cannot see spend from a call that hasn't finished
    // yet, which is exactly why the fix must serialize rather than add a
    // smarter check.
    await expect(assertCanRunProviderCall(workspaceId, "tailor")).resolves.toBeUndefined();
    await expect(assertCanRunProviderCall(workspaceId, "cover_letter")).resolves.toBeUndefined();
  });
});
