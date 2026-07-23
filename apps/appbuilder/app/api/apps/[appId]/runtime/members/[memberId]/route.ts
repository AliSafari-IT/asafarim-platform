import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { changeMemberRoles, revokeMember } from "@/lib/generated-data/membership";
import { ChangeMemberRolesBody } from "@/lib/validation/runtime";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; memberId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, memberId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ChangeMemberRolesBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role payload." }, { status: 400 });
  }

  try {
    const member = await changeMemberRoles(getDb(), actor, appId, memberId, parsed.data.roleIds);
    return NextResponse.json({ member });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Revokes (never hard-deletes) a member — protected against removing the app's final administrator. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, memberId } = await params;
  try {
    const member = await revokeMember(getDb(), actor, appId, memberId);
    return NextResponse.json({ member });
  } catch (err) {
    return errorResponse(err);
  }
}
