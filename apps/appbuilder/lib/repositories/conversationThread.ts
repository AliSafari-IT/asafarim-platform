import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { conversations } from "../db/schema";
import type { Actor } from "../auth/actor";
import { generateId } from "../db/ids";

export type ConversationRow = typeof conversations.$inferSelect;

/**
 * Gets the app's single conversation thread, creating it on first use.
 * MUST be called with `tx` as an active transaction shared with whatever
 * write is about to reference the returned id (a message, or — M13 slice B —
 * an attachment initiated before any message exists), so two concurrent
 * first-writes can never race into two conversation rows for the same app
 * (the `conversations_app_id_unique` index would reject the loser anyway,
 * but doing the lookup-then-insert inside the caller's own transaction is
 * what makes the winner's id the one actually used downstream).
 *
 * Lives in its own module rather than in `conversations.ts` purely to keep
 * the import graph acyclic: M13 slice C made `conversations.ts` depend on
 * `attachments.ts` (a message claims its attachments inside the message's
 * own transaction), and `attachments.ts` already needed this function.
 */
export async function ensureConversation(tx: Db, appId: string, actor: Actor): Promise<ConversationRow> {
  const [existing] = await tx.select().from(conversations).where(eq(conversations.appId, appId)).limit(1);
  if (existing) return existing;
  const [created] = await tx
    .insert(conversations)
    .values({ id: generateId(), appId, createdByPrincipalId: actor.principalId })
    .returning();
  return created;
}
