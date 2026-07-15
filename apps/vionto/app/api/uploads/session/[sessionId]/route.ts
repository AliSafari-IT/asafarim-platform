import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import {
  getSessionForUser,
  addAssetToSession,
  removeAssetFromSession,
  deleteSession,
} from "@/lib/server/upload-session";

export const runtime = "nodejs";

/**
 * GET /api/uploads/session/[sessionId]
 *
 * Retrieve session details and staged assets.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { sessionId } = await params;
    const session = getSessionForUser(sessionId, user.id);
    if (!session) {
      return badRequest("Session not found or expired.");
    }

    return NextResponse.json({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      assets: session.assets,
      metadata: session.metadata,
    });
  } catch (error) {
    return serverError("uploads/session/[sessionId]", error);
  }
}

/**
 * PUT /api/uploads/session/[sessionId]
 *
 * Update session: reorder assets, update metadata, or add a new asset record.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { sessionId } = await params;
    let session = getSessionForUser(sessionId, user.id);
    if (!session) {
      return badRequest("Session not found or expired.");
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    // Reorder assets by keys array
    if (Array.isArray(body.reorderedKeys)) {
      const keySet = new Set(session.assets.map((a) => a.key));
      const orderedKeys = (body.reorderedKeys as string[]).filter((k) => keySet.has(k));
      const remaining = session.assets.filter((a) => !new Set(orderedKeys).has(a.key));
      const ordered = orderedKeys
        .map((k) => session.assets.find((a) => a.key === k))
        .filter(Boolean);
      session.assets = [...(ordered as typeof session.assets), ...remaining];
    }

    // Update metadata
    if (body.metadata !== undefined && typeof body.metadata === "object") {
      session.metadata = { ...session.metadata, ...(body.metadata as Record<string, unknown>) };
    }

    return NextResponse.json({
      id: session.id,
      assets: session.assets,
      metadata: session.metadata,
    });
  } catch (error) {
    return serverError("uploads/session/[sessionId]", error);
  }
}

/**
 * DELETE /api/uploads/session/[sessionId]
 *
 * Delete an upload session and all staged assets.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { sessionId } = await params;
    const session = getSessionForUser(sessionId, user.id);
    if (!session) {
      return badRequest("Session not found or expired.");
    }

    const deleted = deleteSession(sessionId);
    return NextResponse.json({ id: sessionId, deleted });
  } catch (error) {
    return serverError("uploads/session/[sessionId]", error);
  }
}
