import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { getStorageStatus } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * GET /api/me
 *
 * Returns the current authenticated user's ID and storage configuration.
 * Useful for CLI/scripts that need to know which storage prefix to target.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const storage = getStorageStatus();
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      storage: { ...storage, prefix: `vionto/${user.id}/` },
    });
  } catch (error) {
    return serverError("me", error);
  }
}
