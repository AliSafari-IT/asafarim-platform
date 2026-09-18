import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * AI spend view: AiUsageLedger, aggregated by kind (embed/evaluate under the
 * old matching product, `tailor` under ResuMatch). Read-only, superadmin
 * console-facing, bearer-token gated in constant time the same way as
 * app/api/internal/user-activity/route.ts (this app's only existing
 * admin/debug route pattern) — no session, 404s when the secret is unset,
 * listed in proxy.ts publicRoutes for the same reason that route is.
 *
 * `workspaceId` is optional: omit it for a platform-wide total (every
 * workspace's ledger), or pass it to scope the view to one workspace — the
 * same shape `usageSummary` (lib/tailoring/ai/quota.ts) reads per-workspace.
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

  const [ledgerAgg, ledgerByKind] = await Promise.all([
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
  ]);

  return NextResponse.json({
    workspaceId,
    ledger: {
      totalCostUsd: ledgerAgg._sum.costUsd ?? 0,
      totalInputTokens: ledgerAgg._sum.inputTokens ?? 0,
      totalOutputTokens: ledgerAgg._sum.outputTokens ?? 0,
      callCount: ledgerAgg._count,
      byKind: ledgerByKind.map((row: (typeof ledgerByKind)[number]) => ({
        kind: row.kind,
        costUsd: row._sum.costUsd ?? 0,
        callCount: row._count,
      })),
    },
  });
}
