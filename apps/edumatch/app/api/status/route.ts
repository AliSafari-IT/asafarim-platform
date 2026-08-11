import { NextResponse } from "next/server";
import { pingDb } from "@asafarim/db";

// Public, unauthenticated liveness endpoint for the proof board
// (apps/showcase/app/proof). Allow-listed fields only — no hostnames,
// ports, or connection details. See docs/proof-board-plan.md.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const db = await pingDb();
  // Non-2xx when degraded: apps/showcase/app/proof/data.ts already treats a
  // non-ok response as "unreachable" (distinct from the 200-with-degraded-
  // body case it also handles), so this doesn't change that consumer's
  // behavior. It does make the endpoint usable as a real Docker healthcheck
  // target — `wget`/`curl -f` only fail on a non-2xx status, so a 200 that
  // merely says "degraded" in its body was previously indistinguishable
  // from healthy to anything checking the HTTP status alone.
  return NextResponse.json(
    {
      app: "edumatch",
      status: db.ok ? "ok" : "degraded",
      db: db.ok ? "ok" : "unreachable",
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - started,
    },
    { status: db.ok ? 200 : 503 },
  );
}
