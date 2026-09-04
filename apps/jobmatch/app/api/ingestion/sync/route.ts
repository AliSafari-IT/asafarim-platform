import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../lib/db/client";
import { pruneSnapshots, refreshPostingStates, runSync } from "../../../../lib/ingestion/run";
import { logError } from "../../../../lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run ingestion, driven by an external scheduler.
 *
 * Not a user route: it makes outbound requests on the platform's behalf and
 * rewrites the job table, so it is authenticated by a shared secret rather
 * than a session. When `JOBMATCH_INGESTION_TOKEN` is unset the route is
 * disabled outright — an unset secret must never mean "no authentication
 * required", which is how an internal endpoint becomes a public one.
 *
 * Holding the token is not authorisation to fetch. Each source's own
 * agreement is still checked inside `runSync`, and a source without one is
 * refused no matter who asked.
 */
export async function POST(request: Request) {
  const expected = process.env.JOBMATCH_INGESTION_TOKEN;
  if (!expected) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!isEqual(presented, expected)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  let mapping: unknown;
  let sourceKey: string | undefined;
  try {
    const body = (await request.json()) as { sourceKey?: string; mapping?: unknown };
    sourceKey = body.sourceKey;
    mapping = body.mapping;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const db = getJobmatchDb();
  const sources = await db.jobSource.findMany({
    where: sourceKey ? { key: sourceKey } : {},
    select: { id: true, key: true },
  });

  const results: unknown[] = [];
  for (const source of sources) {
    try {
      results.push({ key: source.key, ...(await runSync(source.id, mapping)) });
    } catch (error) {
      // One source failing must not abandon the rest, and the error itself
      // is never surfaced: it can carry the endpoint, key included.
      logError("ingestion.sync.failed", error, { sourceKey: source.key });
      results.push({ key: source.key, outcome: "FAILED", reasonCode: "UNEXPECTED_ERROR" });
    }
  }

  // Freshness and retention are driven by the passage of time rather than by
  // a sync, so they run on the same schedule whether or not a source had
  // anything new to give.
  const statesChanged = await refreshPostingStates();
  const snapshotsPruned = await pruneSnapshots();

  return NextResponse.json({ results, statesChanged, snapshotsPruned });
}

/** Constant-time comparison, so a wrong token cannot be found byte by byte. */
function isEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length; compare against a same-length buffer and fold the result in.
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}
