import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getConversationForActor, listMessagesForActor } from "@/lib/repositories/conversations";
import { listConversationAttachmentsForActor } from "@/lib/repositories/attachments";
import { attachmentPolicy } from "@/lib/attachments/limits";
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
 *
 * M13 slice C adds the attachments visible to this actor (every attachment
 * already claimed by a message, plus their own not-yet-sent uploads — see
 * lib/repositories/attachments.ts#listConversationAttachmentsForActor) so
 * attachment cards and an in-progress composer draft survive a refresh the
 * same way messages do, and the server-owned attachment catalogue, so "the
 * client keeps no divergent allowlist" (M13 spec, Composer) stays literally
 * true: the composer validates against exactly these numbers.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  try {
    const db = getDb();
    const [conversation, messages, attachments] = await Promise.all([
      getConversationForActor(db, actor, appId),
      listMessagesForActor(db, actor, appId),
      listConversationAttachmentsForActor(db, actor, appId),
    ]);
    return NextResponse.json({ conversation, messages, attachments, attachmentPolicy: attachmentPolicy() });
  } catch (err) {
    return errorResponse(err);
  }
}
