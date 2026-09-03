import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepExpiredDocuments } from "../../../lib/documents/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retention sweep, driven by an external scheduler.
 *
 * Not a user route: it deletes other people's documents, so it is
 * authenticated by a shared secret rather than a session. When
 * JOBMATCH_RETENTION_TOKEN is unset the route is disabled outright — an
 * unset secret must never mean "no authentication required", which is how
 * an internal endpoint becomes a public one.
 */
export async function POST(request: Request) {
  const expected = process.env.JOBMATCH_RETENTION_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!isEqual(presented, expected)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const result = await sweepExpiredDocuments();
  return NextResponse.json(result);
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
