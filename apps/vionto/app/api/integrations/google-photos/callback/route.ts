import { NextResponse } from "next/server";

import { getAuthedUser, serverError } from "@/lib/server/auth";
import { upsertGooglePhotosConnection } from "@/lib/server/google-photos/connection";
import { exchangeCode, fetchUserInfo } from "@/lib/server/google-photos/oauth";
import { verifyState } from "@/lib/server/google-photos/state";

export const runtime = "nodejs";

/** Redirect back to the app with a status query param the UI can read. */
function redirectWithStatus(returnTo: string, status: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_VIONTO_URL ?? "http://localhost:3006";
  const target = new URL(returnTo, base);
  target.searchParams.set("googlePhotos", status);
  return NextResponse.redirect(target.toString());
}

/**
 * GET /api/integrations/google-photos/callback
 *
 * OAuth redirect target. Validates the signed `state`, exchanges the code,
 * stores the (encrypted) tokens, then returns the user to where they started.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = verifyState(url.searchParams.get("state"));

    // Without a valid state we can't trust the return path — go home.
    const returnTo = state?.returnTo ?? "/create";

    if (error) {
      // User denied consent or Google returned an error.
      return redirectWithStatus(returnTo, error === "access_denied" ? "denied" : "error");
    }
    if (!state) {
      return redirectWithStatus("/create", "invalid_state");
    }

    // Defense-in-depth: the session user must match the state's user.
    const user = await getAuthedUser();
    if (!user || user.id !== state.userId) {
      return redirectWithStatus(returnTo, "session_mismatch");
    }
    if (!code) {
      return redirectWithStatus(returnTo, "error");
    }

    const tokens = await exchangeCode(code);

    let email: string | null = null;
    let sub: string | null = null;
    try {
      const info = await fetchUserInfo(tokens.accessToken);
      email = info.email ?? null;
      sub = info.sub ?? null;
    } catch {
      // Identity lookup is best-effort; the grant is still valid without it.
    }

    await upsertGooglePhotosConnection({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
      googleAccountEmail: email,
      googleAccountSub: sub,
    });

    return redirectWithStatus(returnTo, "connected");
  } catch (error) {
    return serverError("google-photos/callback", error);
  }
}
