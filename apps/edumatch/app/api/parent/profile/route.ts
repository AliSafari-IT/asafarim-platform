import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { ensureParentProfile, getParentProfile } from "@/lib/server/parent";

export const runtime = "nodejs";

/**
 * GET /api/parent/profile
 *
 * Whether the caller is registered as a parent yet. Used by the onboarding
 * flow to decide whether "I am a parent" needs to create the row or can
 * skip straight to "add a child".
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const profile = await getParentProfile(user.id);
    return NextResponse.json({ isParent: profile !== null });
  } catch (error) {
    return serverError("parent/profile GET", error);
  }
}

/**
 * POST /api/parent/profile
 *
 * Register the caller as a parent. Idempotent.
 */
export async function POST() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    await ensureParentProfile(user.id);
    return NextResponse.json({ isParent: true }, { status: 201 });
  } catch (error) {
    return serverError("parent/profile POST", error);
  }
}
