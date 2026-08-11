import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

// Public, unauthenticated liveness endpoint for the proof board
// (apps/showcase/app/proof). Allow-listed fields only — no hostnames,
// ports, or connection details. AppBuilder keeps its own isolated database
// (APPBUILDER_DATABASE_URL), separate from the shared platform Prisma DB.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let dbOk = true;
  try {
    await getDb().execute(sql`SELECT 1`);
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    app: "appbuilder",
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "unreachable",
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - started,
  });
}
