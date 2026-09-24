import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * AI spend ledger reconciliation. Calls the route handler directly (a plain
 * async function taking a Request, like every other Next.js Route Handler)
 * against a real database, guarded behind RESUMATCH_TEST_DATABASE_URL like
 * the rest of this app's *.integration.test.ts files. The default
 * vitest.config.ts excludes *.integration.test.ts, so this runs via the
 * dedicated test:integration script (vitest.integration.config.ts), not
 * `vitest run <path>` directly.
 *
 *   INTERNAL_API_SECRET=test-secret RESUMATCH_TEST_DATABASE_URL=postgresql://... \
 *     pnpm --filter @asafarim/resumatch test:integration
 */

const TEST_DB = process.env.RESUMATCH_TEST_DATABASE_URL;
if (TEST_DB) process.env.RESUMATCH_DATABASE_URL = TEST_DB;
if (TEST_DB && !process.env.INTERNAL_API_SECRET) {
  process.env.INTERNAL_API_SECRET = "ai-spend-test-secret";
}

describe.skipIf(!TEST_DB)("GET /api/internal/ai-spend — ledger reconciliation", () => {
  let db: import("../../../../lib/db/generated").PrismaClient;
  let GET: typeof import("./route").GET;
  let workspaceId: string;

  beforeAll(async () => {
    ({ GET } = await import("./route"));
    db = (await import("../../../../lib/db/client")).getJobmatchDb();

    const ws = await db.workspace.create({
      data: { platformUserId: `ai-spend-test-${Date.now()}` },
      select: { id: true },
    });
    workspaceId = ws.id;

    await db.aiUsageLedger.createMany({
      data: [
        {
          workspaceId,
          kind: "tailor",
          provider: "fixture",
          model: "fixture-1",
          promptVersion: "tailor-1",
          costUsd: 0.002,
        },
        {
          workspaceId,
          kind: "tailor",
          provider: "fixture",
          model: "fixture-1",
          promptVersion: "tailor-1",
          costUsd: 0.001,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.aiUsageLedger.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  });

  it("404s without a valid bearer token", async () => {
    const res = await GET(new Request(`http://localhost/api/internal/ai-spend?workspaceId=${workspaceId}`));
    expect(res.status).toBe(404);
  });

  it("reports ledger totals grouped by kind", async () => {
    const res = await GET(
      new Request(`http://localhost/api/internal/ai-spend?workspaceId=${workspaceId}`, {
        headers: { authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ledger.totalCostUsd).toBeCloseTo(0.003, 6);
    expect(body.ledger.callCount).toBe(2);
    expect(body.ledger.byKind).toEqual([
      { kind: "tailor", costUsd: expect.closeTo(0.003, 6), callCount: 2 },
    ]);
  });
});
