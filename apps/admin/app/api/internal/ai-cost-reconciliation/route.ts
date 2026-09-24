import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { isReconciliationRunning, startReconciliation } from "../../../../lib/server/ai-cost-reconciliation";

/**
 * POST /api/internal/ai-cost-reconciliation?days=7
 *
 * Scheduler entry point for AI cost reconciliation (#592) — e.g. an hourly
 * VPS cron `curl -X POST -H "Authorization: Bearer $INTERNAL_API_SECRET"`.
 * Carries no session: authenticates the shared INTERNAL_API_SECRET bearer
 * in constant time and 404s when it is unset or wrong, like
 * /api/internal/settings. Responds 202 at once and runs the job after the
 * response, so a slow provider never holds the caller; 409 while a run is
 * already in progress.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const presentedBuf = Buffer.from(presented);
  const secretBuf = Buffer.from(secret);
  if (presentedBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(presentedBuf, secretBuf);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (await isReconciliationRunning()) {
    return NextResponse.json({ accepted: false, reason: "already_running" }, { status: 409 });
  }
  const daysParam = new URL(request.url).searchParams.get("days");
  const days = daysParam ? Number(daysParam) : undefined;
  if (days !== undefined && !Number.isFinite(days)) {
    return NextResponse.json({ error: "days must be a number" }, { status: 400 });
  }

  after(async () => {
    await startReconciliation({ trigger: "scheduled", triggeredBy: null, days });
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
