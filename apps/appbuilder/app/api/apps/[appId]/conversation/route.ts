import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getConversationForActor, listMessagesForActor } from "@/lib/repositories/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * The full persisted conversation for this app — conversation thread (null
 * if no message has ever been sent) plus every message, oldest first. This
 * is what makes refresh/sign-out/device-change/navigate-away-and-back
 * resume the conversation: the client never trusts its own in-memory state
 * as authoritative, it re-fetches this on mount.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const db = getDb();
    const [conversation, messages] = await Promise.all([
      getConversationForActor(db, actor, appId),
      listMessagesForActor(db, actor, appId),
    ]);
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    return errorResponse(err);
  }
}
