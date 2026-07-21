import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { addCollaborator, listCollaborators } from "@/lib/repositories/collaborators";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

const VALID_ROLES = new Set(["viewer", "editor", "owner"]);

export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const collaborators = await listCollaborators(getDb(), actor, appId);
    return NextResponse.json({ collaborators });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Adds a collaborator. Owner-only (enforced by assertCapability inside
 * addCollaborator, not by anything checked here) — the actor performing
 * this is always the session-derived one, never a body field.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.principalId !== "string" || !VALID_ROLES.has(body.role)) {
    return NextResponse.json(
      { error: "principalId (string) and role ('viewer' | 'editor' | 'owner') are required" },
      { status: 400 },
    );
  }

  try {
    const collaborator = await addCollaborator(getDb(), actor, appId, body.principalId, body.role);
    return NextResponse.json({ collaborator }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
