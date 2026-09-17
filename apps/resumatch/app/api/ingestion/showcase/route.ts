import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { loadShowcaseSource } from "../../../../lib/ingestion/showcaseSource";
import { logError } from "../../../../lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Load (or reload) the synthetic showcase source — the operator entry point
 * for issue #208's Option C.
 *
 * Authenticated by the same shared secret as `POST /api/ingestion/sync`
 * (`JOBMATCH_INGESTION_TOKEN`): it rewrites the job table, so it is not a
 * candidate route, and an unset token disables it outright rather than
 * leaving it open. The data it loads is fabricated demo content — see
 * lib/ingestion/showcaseSource.ts.
 *
 * Body: `{ "reset": true }` to wipe the source's postings/snapshots/runs
 * first; omitted or `false` re-syncs in place (idempotent).
 */
export async function POST(request: Request) {
  const expected = process.env.JOBMATCH_INGESTION_TOKEN;
  if (!expected) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!isEqual(presented, expected)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  let reset = false;
  try {
    const body = (await request.json().catch(() => ({}))) as { reset?: unknown };
    reset = body.reset === true;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await loadShowcaseSource({ reset });
    return NextResponse.json({ result });
  } catch (error) {
    logError("ingestion.showcase.failed", error);
    return NextResponse.json(
      { error: "The showcase source could not be loaded." },
      { status: 500 },
    );
  }
}

/** Constant-time comparison, so a wrong token cannot be found byte by byte. */
function isEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}
