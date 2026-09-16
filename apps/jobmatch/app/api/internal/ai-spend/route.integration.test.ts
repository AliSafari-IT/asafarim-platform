import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * JM-047 acceptance: "Ledger reconciles with MatchRun count and reported
 * cost." Calls the route handler directly (a plain async function taking a
 * Request, like every other Next.js Route Handler) against a real database,
 * guarded behind JOBMATCH_TEST_DATABASE_URL like the rest of this app's
 * *.integration.test.ts files.
 *
 *   INTERNAL_API_SECRET=test-secret JOBMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/jobmatch exec vitest run app/api/internal/ai-spend/route.integration.test.ts
 */

const TEST_DB = process.env.JOBMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.JOBMATCH_DATABASE_URL = TEST_DB;
if (TEST_DB && !process.env.INTERNAL_API_SECRET) {
  process.env.INTERNAL_API_SECRET = "jm047-test-secret";
}

describe.skipIf(!TEST_DB)("GET /api/internal/ai-spend — ledger reconciliation", () => {
  let db: import("../../../../lib/db/generated").PrismaClient;
  let GET: typeof import("./route").GET;
  let workspaceId: string;

  beforeAll(async () => {
    ({ GET } = await import("./route"));
    db = (await import("../../../../lib/db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `jm047-spend-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    await db.aiUsageLedger.createMany({
      data: [
        { workspaceId, kind: "embed", provider: "fixture", model: "fixture-1", costUsd: 0.001 },
        { workspaceId, kind: "embed", provider: "fixture", model: "fixture-1", costUsd: 0.001 },
        {
          workspaceId,
          kind: "evaluate",
          provider: "fixture",
          model: "fixture-eval-1",
          promptVersion: "match-eval-1",
          costUsd: 0.003,
        },
      ],
    });
    await db.matchRun.createMany({
      data: [
        {
          workspaceId,
          profileVersionId: "pv-1",
          postingId: "posting-1",
          promptVersion: "match-eval-1",
          evaluationModelVersion: "fixture-eval-1",
          costUsd: 0.002,
          degraded: false,
          result: { fake: true },
        },
        {
          workspaceId,
          profileVersionId: "pv-1",
          postingId: "posting-2",
          promptVersion: "match-eval-1",
          evaluationModelVersion: "fixture-eval-1",
          costUsd: 0.001,
          degraded: true,
          result: { fake: true },
        },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.matchRun.deleteMany({ where: { workspaceId } });
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("404s without a valid bearer token", async () => {
    const res = await GET(new Request(`http://localhost/api/internal/ai-spend?workspaceId=${workspaceId}`));
    expect(res.status).toBe(404);
  });

  it("reports ledger totals and MatchRun count/cost that reconcile", async () => {
    const res = await GET(
      new Request(`http://localhost/api/internal/ai-spend?workspaceId=${workspaceId}`, {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Ledger total: 0.001 + 0.001 + 0.003
    expect(body.ledger.totalCostUsd).toBeCloseTo(0.005, 6);
    expect(body.ledger.callCount).toBe(3);

    // MatchRun: 2 runs, cost 0.002 + 0.001, one degraded
    expect(body.matchRuns.count).toBe(2);
    expect(body.matchRuns.totalCostUsd).toBeCloseTo(0.003, 6);
    expect(body.matchRuns.costPerEvaluation).toBeCloseTo(0.0015, 6);
    expect(body.matchRuns.degradedCount).toBe(1);
    expect(body.matchRuns.degradedRatio).toBeCloseTo(0.5, 6);

    // Reconciliation: the endpoint's own reported MatchRun total matches an
    // independent aggregate straight off the ledger's "evaluate" rows plus
    // an independent count off match_run directly.
    const independentRunCount = await db.matchRun.count({ where: { workspaceId } });
    const independentRunCost = await db.matchRun.aggregate({
      where: { workspaceId },
      _sum: { costUsd: true },
    });
    expect(body.matchRuns.count).toBe(independentRunCount);
    expect(body.matchRuns.totalCostUsd).toBeCloseTo(independentRunCost._sum.costUsd ?? 0, 6);
  });
});
