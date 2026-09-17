import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * AI spend view (JM-047 / JM-009 KPI): AiUsageLedger vs MatchRun, aggregated
 * for cost-per-evaluation. Read-only, superadmin console-facing, bearer-token
 * gated in constant time the same way as
 * app/api/internal/user-activity/route.ts (this app's only existing
 * admin/debug route pattern) — no session, 404s when the secret is unset,
 * listed in proxy.ts publicRoutes for the same reason that route is.
 *
 * `workspaceId` is optional: omit it for a platform-wide total (every
 * workspace's ledger + every MatchRun), or pass it to scope the view to one
 * workspace — the same shape `usageSummary` (lib/matching/ai/quota.ts) reads
 * per-workspace, but this endpoint additionally reports run counts and the
 * degraded ratio, which `usageSummary` does not need for its budget check.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const presentedBuf = Buffer.from(presented);
  const secretBuf = Buffer.from(secret);
  if (presentedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(presentedBuf, secretBuf);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  const db = getJobmatchDb();
  const ledgerWhere = workspaceId ? { workspaceId } : {};
  const runWhere = workspaceId ? { workspaceId } : {};

  const [ledgerAgg, ledgerByKind, runAgg, degradedRuns] = await Promise.all([
    db.aiUsageLedger.aggregate({
      where: ledgerWhere,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      _count: true,
    }),
    db.aiUsageLedger.groupBy({
      by: ["kind"],
      where: ledgerWhere,
      _sum: { costUsd: true },
      _count: true,
    }),
    db.matchRun.aggregate({
      where: runWhere,
      _sum: { costUsd: true },
      _count: true,
    }),
    db.matchRun.count({ where: { ...runWhere, degraded: true } }),
  ]);

  const totalLedgerCostUsd = ledgerAgg._sum.costUsd ?? 0;
  const totalRunCostUsd = runAgg._sum.costUsd ?? 0;
  const runCount = runAgg._count;

  return NextResponse.json({
    workspaceId,
    ledger: {
      totalCostUsd: totalLedgerCostUsd,
      totalInputTokens: ledgerAgg._sum.inputTokens ?? 0,
      totalOutputTokens: ledgerAgg._sum.outputTokens ?? 0,
      callCount: ledgerAgg._count,
      byKind: ledgerByKind.map((row) => ({
        kind: row.kind,
        costUsd: row._sum.costUsd ?? 0,
        callCount: row._count,
      })),
    },
    matchRuns: {
      count: runCount,
      totalCostUsd: totalRunCostUsd,
      // Null rather than 0 when there are no runs — an average of zero runs
      // is undefined, not free.
      costPerEvaluation: runCount > 0 ? totalRunCostUsd / runCount : null,
      degradedCount: degradedRuns,
      degradedRatio: runCount > 0 ? degradedRuns / runCount : null,
    },
  });
}
