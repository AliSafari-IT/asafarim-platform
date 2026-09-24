import { NextResponse } from "next/server";
import { registerUser } from "@asafarim/auth";
import { getBooleanSetting } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/auth/register
 *
 * Self-registration: username/email/password (+ optional address). See
 * @asafarim/auth's registerUser for validation, uniqueness checks, and
 * password hashing.
 *
 * Gated on the "registration.open" platform setting (admin console →
 * Settings), read through @asafarim/db's shared settings helper — the
 * setting's own catalog description promises new sign-ups stop while
 * existing sessions/sign-ins are unaffected, and this route is that
 * promise's actual enforcement point. Defaults to open (matching the
 * catalog default) if the settings DB is unreachable, so a settings-DB
 * hiccup never locks out registration platform-wide.
 */
export async function POST(request: Request) {
  const registrationOpen = await getBooleanSetting("registration.open", true);
  if (!registrationOpen) {
    return NextResponse.json(
      { error: "New account registration is currently closed." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await registerUser(body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: "Account created successfully.", user: result.user }, { status: 201 });
}
