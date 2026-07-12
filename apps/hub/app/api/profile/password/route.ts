import { NextResponse } from "next/server";
import { getSession, changePassword } from "@asafarim/auth";

export const runtime = "nodejs";

/**
 * POST /api/profile/password
 *
 * Changes the signed-in user's password. If they already have one set, the
 * current password must be supplied and verified first; otherwise (an
 * OAuth-only account) this sets an initial password.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = await changePassword(session.user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ message: "Password updated." });
}
