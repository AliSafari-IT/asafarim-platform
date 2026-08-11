import { NextResponse } from "next/server";
import { pingDb } from "@asafarim/db";

// Public, unauthenticated liveness endpoint for the proof board
// (apps/showcase/app/proof). Allow-listed fields only — no hostnames,
// ports, or connection details. See docs/proof-board-plan.md.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const db = await pingDb();
  return NextResponse.json({
    app: "timelineai",
    status: db.ok ? "ok" : "degraded",
    db: db.ok ? "ok" : "unreachable",
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - started,
  });
}
