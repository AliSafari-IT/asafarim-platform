import { NextResponse } from "next/server";
import { registerUser } from "@asafarim/auth";

export const runtime = "nodejs";

/**
 * POST /api/auth/register
 *
 * Self-registration: username/email/password (+ optional address). See
 * @asafarim/auth's registerUser for validation, uniqueness checks, and
 * password hashing.
 */
export async function POST(request: Request) {
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
