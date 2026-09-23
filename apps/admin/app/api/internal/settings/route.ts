import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getEffectiveSettings } from "@asafarim/db";
import { buildInternalSettingsPayload, parseScope } from "../../../../lib/internal-settings";

/**
 * GET /api/internal/settings?scope=<app>
 *
 * Read-only platform settings for apps on their own isolated database
 * (Testora, AppBuilder, ResuMatch), consumed through
 * @asafarim/settings-client. Apps on the platform database read in-process
 * via @asafarim/db instead and never call this.
 *
 * Carries no session: authenticates the shared INTERNAL_API_SECRET bearer in
 * constant time and 404s when it is unset or wrong — the platform's
 * machine-endpoint pattern (see the apps' /api/internal/user-activity
 * routes). Secrets are never returned in plaintext; see
 * docs/admin-settings-api.md for the trust boundary.
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

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const parsed = parseScope(new URL(request.url).searchParams.get("scope"));
  if (!parsed.ok) {
    return NextResponse.json({ error: "Invalid scope." }, { status: 400 });
  }

  try {
    const effective = await getEffectiveSettings();
    return NextResponse.json(buildInternalSettingsPayload(effective, parsed.scope), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin] internal settings read failed:", error);
    // Callers treat any non-2xx as "use your fallback" — no detail needed.
    return NextResponse.json({ error: "Settings unavailable." }, { status: 503 });
  }
}
