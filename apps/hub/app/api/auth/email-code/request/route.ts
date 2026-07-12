import { NextResponse } from "next/server";
import { requestEmailLoginCode } from "@asafarim/auth";

export const runtime = "nodejs";

/**
 * POST /api/auth/email-code/request
 *
 * Sends a one-time login code to the given email — but only if it belongs to
 * a registered, active user. The response is intentionally generic
 * (anti-enumeration): callers cannot tell whether an email is registered.
 * Rate-limited per email; see @asafarim/auth's requestEmailLoginCode.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const result = await requestEmailLoginCode(body.email);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: result.message });
}
