import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { changeCollaboratorRole, revokeCollaborator } from "@/lib/repositories/collaborators";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; collaboratorId: string }>;
}

const VALID_ROLES = new Set(["viewer", "editor", "owner"]);

/** Owner-only role change (assertCapability inside changeCollaboratorRole enforces this). */
export async function PATCH(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, collaboratorId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: "role ('viewer' | 'editor' | 'owner') is required" }, { status: 400 });
  }

  try {
    const collaborator = await changeCollaboratorRole(getDb(), actor, appId, collaboratorId, body.role);
    return NextResponse.json({ collaborator });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Owner-only removal (assertCapability inside revokeCollaborator enforces this). */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, collaboratorId } = await params;
  try {
    const collaborator = await revokeCollaborator(getDb(), actor, appId, collaboratorId);
    return NextResponse.json({ collaborator });
  } catch (err) {
    return errorResponse(err);
  }
}
