import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { deleteConversationReference, getReferenceForActor } from "@/lib/repositories/references";
import { describeFreshness } from "@/lib/references/provenance";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string; referenceId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, referenceId } = await params;
  try {
    const db = getDb();
    const reference = await getReferenceForActor(db, actor, appId, referenceId);
    return NextResponse.json({
      reference,
      freshnessLabel: describeFreshness(reference.freshness, reference.fetchedAt),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Removes an imported reference: tombstones the row and clears the stored remote text (see deleteConversationReference). Idempotent. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, referenceId } = await params;
  try {
    const db = getDb();
    const reference = await deleteConversationReference(db, actor, appId, referenceId);
    return NextResponse.json({ reference });
  } catch (err) {
    return errorResponse(err);
  }
}
