import { NextResponse } from "next/server";

import { getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { revokeAndDeleteGooglePhotosConnection } from "@/lib/server/google-photos/disconnect";

export const runtime = "nodejs";

/**
 * POST /api/integrations/google-photos/disconnect
 *
 * Revokes the grant at Google (best-effort) and deletes the stored connection.
 */
export async function POST() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const result = await revokeAndDeleteGooglePhotosConnection(user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return serverError("google-photos/disconnect", error);
  }
}
