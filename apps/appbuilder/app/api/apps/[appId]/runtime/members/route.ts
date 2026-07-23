import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { addMember, bootstrapOwnerAsAdmin, listMembers } from "@/lib/generated-data/membership";
import { AddMemberBody, BootstrapAdminBody } from "@/lib/validation/runtime";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/** Builder-only (`app.manageGeneratedMembers`, owner-rank) membership list — not the generated app's own member-facing surface. */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const members = await listMembers(getDb(), actor, appId);
    return NextResponse.json({ members });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Adds a generated-app member, OR bootstraps the app owner as its first
 * administrator when the body carries `adminRoleId` instead of
 * `principalId`/`roleIds` — both are builder-side, owner-rank actions.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);

  const bootstrap = BootstrapAdminBody.safeParse(raw);
  if (bootstrap.success) {
    try {
      const member = await bootstrapOwnerAsAdmin(getDb(), actor, appId, bootstrap.data.adminRoleId);
      return NextResponse.json({ member }, { status: 201 });
    } catch (err) {
      return errorResponse(err);
    }
  }

  const parsed = AddMemberBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid member payload." }, { status: 400 });
  }
  try {
    const member = await addMember(getDb(), actor, appId, parsed.data);
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
