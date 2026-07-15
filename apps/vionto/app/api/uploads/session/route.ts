import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { createSession, getSessionForUser, listStaleSessions } from "@/lib/server/upload-session";

export const runtime = "nodejs";

/**
 * GET /api/uploads/session
 *
 * List active upload sessions for the authenticated user.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const includeStale = searchParams.get("stale") === "true";

    // In-memory sessions: iterate and filter by user
    const sessions = listStaleSessions(24 * 60 * 60 * 1000).filter(
      (s) => s.userId === user.id
    );

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        assetCount: s.assets.length,
        metadata: s.metadata,
      })),
      total: sessions.length,
    });
  } catch (error) {
    return serverError("uploads/session", error);
  }
}

/**
 * POST /api/uploads/session
 *
 * Create a new upload session.
 */
export async function POST(_req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const session = createSession(user.id, { source: "api-create" });

    return NextResponse.json({
      sessionId: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return serverError("uploads/session", error);
  }
}
