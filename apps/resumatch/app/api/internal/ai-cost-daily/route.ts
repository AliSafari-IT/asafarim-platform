import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  internalDailyLines,
  internalLineToWire,
  parseReconcileWindow,
  type CostSource,
  type CredentialSource,
  type EntryType,
  type InternalDailyResponse,
} from "@asafarim/ai-cost-ledger";
import { getJobmatchDb } from "@/lib/db/client";

/**
 * Daily platform-credential AI cost totals for provider reconciliation
 * (issue #592). ResuMatch runs on its own isolated Postgres, so the admin
 * console reads these sums through this bearer-gated route rather than
 * holding a second app's DB credentials. Amounts and counts only —
 * grouped by provider / UTC day / normalized model — never ids, prompts
 * or responses. Read-only: the ledger rows are never touched. Listed in
 * proxy.ts publicRoutes; 404s when INTERNAL_API_SECRET is unset.
 *
 *   GET /api/internal/ai-cost-daily?startDay=2026-09-01&endDay=2026-09-07
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

  const window = parseReconcileWindow(new URL(request.url).searchParams);
  if (!window.ok) {
    return NextResponse.json({ error: window.error }, { status: 400 });
  }

  const events = await getJobmatchDb().aiCostEvent.findMany({
    where: {
      occurredAt: { gte: window.from, lt: window.to },
      credentialSource: "platform",
      fixture: false,
    },
    select: {
      provider: true,
      responseModel: true,
      occurredAt: true,
      entryType: true,
      estimatedCostMicros: true,
      actualCostMicros: true,
      adjustmentDeltaMicros: true,
      costSource: true,
      credentialSource: true,
      fixture: true,
    },
  });

  const lines = internalDailyLines(
    "resumatch",
    events.map((e) => ({
      ...e,
      entryType: e.entryType as EntryType,
      costSource: e.costSource as CostSource,
      credentialSource: e.credentialSource as CredentialSource,
    })),
  );

  const body: InternalDailyResponse = {
    app: "resumatch",
    startDay: window.startDay,
    endDay: window.endDay,
    lines: lines.map(internalLineToWire),
  };
  return NextResponse.json(body);
}
