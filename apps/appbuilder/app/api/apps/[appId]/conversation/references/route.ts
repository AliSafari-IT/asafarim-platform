import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listConversationReferencesForActor } from "@/lib/repositories/references";
import { referencePolicy } from "@/lib/references/limits";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Every imported public reference for this app, newest-updated first, plus
 * the server-owned import policy. Same contract as the attachment catalogue:
 * the client keeps no divergent allowlist of schemes/types/limits — it
 * renders what this returns.
 *
 * Reference rows carry provenance and metadata only; the imported remote text
 * is never returned to a client (it is model context, and re-serving
 * third-party content through our own origin is not something a listing
 * endpoint should do). `extractedChars` is there so the UI can show that
 * content exists and how much of it.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const db = getDb();
    const references = await listConversationReferencesForActor(db, actor, appId);
    return NextResponse.json({ references, referencePolicy: referencePolicy() });
  } catch (err) {
    return errorResponse(err);
  }
}
