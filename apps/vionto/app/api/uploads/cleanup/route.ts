import { NextResponse } from "next/server";
import { getAuthedUser, serverError, unauthorized, forbidden } from "@/lib/server/auth";
import { deleteObject } from "@/lib/server/storage";
import { cleanupStaleSessions, getSessionForUser, deleteSession } from "@/lib/server/upload-session";

export const runtime = "nodejs";

/**
 * POST /api/uploads/cleanup
 *
 * Clean up abandoned upload sessions and their associated storage objects.
 * Any authenticated user can clean up their own sessions.
 * Admin / superadmin can run a global cleanup with `mode: "global"`.
 *
 * Body:
 *   - mode: "session" | "global" (default: "session")
 *   - sessionId?: string (required for mode: "session")
 *   - maxAgeMinutes?: number (for global cleanup, default: 60)
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = body.mode === "global" ? "global" : "session";

    if (mode === "session") {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required for mode=session" }, { status: 400 });
      }

      const session = getSessionForUser(sessionId, user.id);
      if (!session) {
        return NextResponse.json({ error: "Session not found or already expired" }, { status: 404 });
      }

      // Delete all storage objects for this session
      const deletedKeys: string[] = [];
      for (const asset of session.assets) {
        await deleteObject(asset.key);
        if (asset.thumbnailKey) await deleteObject(asset.thumbnailKey);
        deletedKeys.push(asset.key);
      }

      deleteSession(sessionId);

      return NextResponse.json({
        success: true,
        mode: "session",
        sessionId,
        deletedAssets: deletedKeys.length,
        deletedKeys,
      });
    }

    // Global cleanup — restricted to admin/superadmin
    const isAdmin = user.roles.includes("admin") || user.roles.includes("superadmin");
    if (!isAdmin) {
      return forbidden("Global cleanup requires admin role");
    }

    const maxAgeMinutes = typeof body.maxAgeMinutes === "number" ? body.maxAgeMinutes : 60;
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    // Note: global cleanup iterates all stale sessions. In a multi-node deployment,
    // replace in-memory session store with Redis + a scheduled worker.
    const cleanedCount = cleanupStaleSessions(maxAgeMs);

    return NextResponse.json({
      success: true,
      mode: "global",
      cleanedSessions: cleanedCount,
      maxAgeMinutes,
    });
  } catch (error) {
    return serverError("uploads/cleanup", error);
  }
}
