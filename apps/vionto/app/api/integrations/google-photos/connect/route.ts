import { NextResponse } from "next/server";

import { getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { isGooglePhotosConfigured } from "@/lib/server/google-photos/config";
import { buildAuthUrl } from "@/lib/server/google-photos/oauth";
import { signState } from "@/lib/server/google-photos/state";

export const runtime = "nodejs";

/**
 * GET /api/integrations/google-photos/connect?returnTo=/create
 *
 * Starts the incremental-OAuth consent flow. Works for any logged-in Vionto
 * user regardless of how they authenticated — connecting Google Photos is
 * separate from their login identity.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    if (!isGooglePhotosConfigured()) {
      return NextResponse.json(
        { error: "Google Photos integration is not configured on this server." },
        { status: 503 },
      );
    }

    const url = new URL(req.url);
    const requested = url.searchParams.get("returnTo") ?? "/create";
    // Only allow same-app relative return paths (open-redirect protection).
    const returnTo = requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/create";

    const state = signState({ userId: user.id, returnTo });
    return NextResponse.redirect(buildAuthUrl(state));
  } catch (error) {
    return serverError("google-photos/connect", error);
  }
}
