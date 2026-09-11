import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Read-only, superadmin console-facing activity feed for one platform
 * user's Testora footprint. Carries no session — authenticates its own
 * bearer token in constant time and 404s when the secret is unset, matching
 * the platform's machine-endpoint pattern.
 *
 * Testora's data model (projects, test cases, results, issues) has no
 * per-user ownership column today — projects are team-scoped, not
 * user-scoped — so this always returns an empty, available section rather
 * than guessing at an ownership join that doesn't exist. That is an honest
 * "no per-user activity model yet", distinct from "no adapter" (issue #301's
 * graceful-degradation principle).
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

  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  return NextResponse.json({
    entries: [],
    summary: { note: "Testora has no per-user activity model yet — projects are team-scoped." },
  });
}
