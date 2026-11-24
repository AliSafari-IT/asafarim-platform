import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Issue #756: the service-wide monthly ceiling against a real database.
 * Spend in two workspaces adds up to the global total; once it reaches the
 * ceiling, a workspace that is still under its own budget is refused with
 * scope "global", and the outcome log records `budget_global`.
 *
 *   RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch exec vitest run --config vitest.integration.config.ts lib/tailoring/ai/quota.global.integration.test.ts
 */

// The global ceiling under test, set per test. Every other setting keeps
// its env fallback, so a live local Admin can't change what this asserts.
let globalBudget: number | null = null;
vi.mock("../../platform-settings", () => ({
  getPlatformSetting: async <T,>(key: string, fallback: T) =>
    key === "resumatch.aiGlobalMonthlyBudgetUsd" && globalBudget !== null ? (globalBudget as T) : fallback,
}));

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) {
  process.env.RESUMATCH_DATABASE_URL = TEST_DB;
  process.env.RESUMATCH_AI_MONTHLY_BUDGET_USD = "20";
  delete process.env.RESUMATCH_AI_GLOBAL_MONTHLY_BUDGET_USD;
}

describe.skipIf(!TEST_DB)("service-wide AI budget (#756)", () => {
  let db: import("../../db/generated").PrismaClient;
  let quota: typeof import("./quota");
  let runProviderCallWithBudget: typeof import("../../ai/runProviderCall").runProviderCallWithBudget;
  const workspaceIds: string[] = [];

  beforeAll(async () => {
    quota = await import("./quota");
    ({ runProviderCallWithBudget } = await import("../../ai/runProviderCall"));
    db = (await import("../../db/client")).getJobmatchDb();
  });

  afterEach(async () => {
    globalBudget = null;
    if (!workspaceIds.length) return;
    await db.aiUsageLedger.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.aiCallOutcome.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    workspaceIds.length = 0;
  });

  async function workspaceWithSpend(costUsd: number): Promise<string> {
    const ws = await db.workspace.create({
      data: { platformUserId: `quota-global-test-${Date.now()}-${Math.random()}` },
      select: { id: true },
    });
    workspaceIds.push(ws.id);
    if (costUsd > 0) {
      await db.aiUsageLedger.create({
        data: { workspaceId: ws.id, kind: "tailor", provider: "fixture", model: "fixture-1", costUsd },
      });
    }
    return ws.id;
  }

  it("sums every workspace, and refuses a user under their own budget once the total reaches the ceiling", async () => {
    // Other suites may leave spend in this database: measure from here.
    const baseline = await quota.globalMonthUsd();
    const heavy = await workspaceWithSpend(15);
    const light = await workspaceWithSpend(1);
    expect(await quota.globalMonthUsd()).toBeCloseTo(baseline + 16, 6);

    // Room left: both pass.
    globalBudget = baseline + 17;
    await expect(quota.assertCanRunProviderCall(light, "tailor")).resolves.toBeUndefined();

    // Ceiling reached: the light user ($1 of $20) is refused, scope global.
    globalBudget = baseline + 16;
    const error = await quota.assertCanRunProviderCall(light, "tailor").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(quota.QuotaExceededError);
    expect(error).toMatchObject({ scope: "global" });
    expect(heavy).toBeTruthy();

    const status = await quota.budgetStatus(light);
    expect(status).toMatchObject({ monthUsd: 1, budgetUsd: 20, globalReached: true });
  });

  it("records which ceiling refused in the call-outcome log", async () => {
    const baseline = await quota.globalMonthUsd();
    const ws = await workspaceWithSpend(2);
    globalBudget = baseline + 2;

    const call = vi.fn();
    const result = await runProviderCallWithBudget({
      workspaceId: ws,
      kind: "tailor",
      prepare: () => ({}),
      call,
      onAttemptFailed: () => undefined,
      isRetryable: () => false,
    });
    expect(result.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();

    const rows = await db.aiCallOutcome.findMany({ where: { workspaceId: ws } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: "budget_refused", errorCode: "budget_global", attempts: 0 });
  });

  it("a user over their own budget is recorded as budget_workspace", async () => {
    const ws = await workspaceWithSpend(20);
    await runProviderCallWithBudget({
      workspaceId: ws,
      kind: "cover_letter",
      prepare: () => ({}),
      call: vi.fn(),
      onAttemptFailed: () => undefined,
      isRetryable: () => false,
    });
    const rows = await db.aiCallOutcome.findMany({ where: { workspaceId: ws } });
    expect(rows[0]).toMatchObject({ outcome: "budget_refused", errorCode: "budget_workspace" });
  });
});
