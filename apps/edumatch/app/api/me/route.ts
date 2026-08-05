import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/server/auth";
import { getEduRoles } from "@/lib/server/profiles";
import { unauthorized, serverError } from "@/lib/server/auth";

/**
 * GET /api/me
 *
 * Returns the authenticated user along with their resolved EduMatch roles.
 * Useful for the client to decide which surfaces to render (student intake,
 * tutor inbox, etc.) without re-deriving the profile state.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const eduRoles = await getEduRoles(user);
    return NextResponse.json({
      id: user.id,
      tenantId: user.tenantId,
      rbacRoles: user.roles,
      eduRoles,
    });
  } catch (error) {
    return serverError("api/me", error);
  }
}
