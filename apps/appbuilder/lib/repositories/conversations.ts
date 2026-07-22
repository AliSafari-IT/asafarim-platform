import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { conversationMessages, conversations } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { generateId } from "../db/ids";
import { NotFoundError } from "../errors";
import type { SelectionContextType } from "../modification/selectionContext";

export type ConversationRow = typeof conversations.$inferSelect;
export type ConversationMessageRow = typeof conversationMessages.$inferSelect;

/**
 * The single conversation thread for an app, if one has ever been started.
 * Never auto-creates — a workspace that has never received a message has
 * no conversation row yet, and viewers must be able to see that empty state
 * without incidentally creating writable state.
 */
export async function getConversationForActor(db: Db, actor: Actor, appId: string): Promise<ConversationRow | null> {
  await assertCapability(db, actor, appId, "app.viewConversation");
  const [row] = await db.select().from(conversations).where(eq(conversations.appId, appId)).limit(1);
  return row ?? null;
}

/** Full persisted message history, oldest first — this is what makes a refresh/sign-out/device-change/navigate-away-and-back resume the conversation, never browser-only state. */
export async function listMessagesForActor(db: Db, actor: Actor, appId: string): Promise<ConversationMessageRow[]> {
  await assertCapability(db, actor, appId, "app.viewConversation");
  return db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.appId, appId))
    .orderBy(asc(conversationMessages.createdAt));
}

export interface AppendUserMessageInput {
  content: string;
  selectionContext: SelectionContextType | null;
  baseVersionNumber: number;
}

/**
 * Records a user's conversational request, creating the app's single
 * conversation thread on first use. This is the ONLY way a `user_request`
 * message is created — always attributed to the trusted session actor
 * (`authorPrincipalId`), never a client-supplied identity. Does not itself
 * enqueue a modification job; the API route does that immediately after,
 * passing this message's id as `triggeringMessageId`.
 */
export async function appendUserMessage(
  db: Db,
  actor: Actor,
  appId: string,
  input: AppendUserMessageInput,
): Promise<{ conversation: ConversationRow; message: ConversationMessageRow }> {
  await assertCapability(db, actor, appId, "app.requestModification");

  return db.transaction(async (tx) => {
    let [conversation] = await tx.select().from(conversations).where(eq(conversations.appId, appId)).limit(1);
    if (!conversation) {
      [conversation] = await tx
        .insert(conversations)
        .values({ id: generateId(), appId, createdByPrincipalId: actor.principalId })
        .returning();
    }

    const [message] = await tx
      .insert(conversationMessages)
      .values({
        id: generateId(),
        conversationId: conversation.id,
        appId,
        role: "user",
        messageType: "user_request",
        content: input.content,
        authorPrincipalId: actor.principalId,
        selectedContext: input.selectionContext ?? undefined,
        baseVersionNumber: input.baseVersionNumber,
        confirmationState: "not_required",
      })
      .returning();

    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));

    return { conversation, message };
  });
}

export interface AppendSystemMessageInput {
  conversationId: string;
  appId: string;
  messageType: "ai_proposal" | "system_status" | "validation_result" | "applied_change" | "failure";
  content: string;
  modificationJobId?: string;
  diffSummary?: Record<string, unknown>;
  impactClassification?: string | null;
  confirmationState?: "not_required" | "pending" | "confirmed" | "expired";
  resultingVersionNumber?: number;
  resultingPreviewBuildId?: string;
  failureCode?: string;
  failureMessage?: string;
}

/**
 * Records an assistant/system-authored milestone message (proposal ready,
 * validation problem, change applied, or failure). Called only from the
 * modification pipeline (worker-side, acting as the job's initiating
 * actor — see lib/modification/pipeline.ts) — never reachable from a
 * client request, so there is no separate capability check here beyond the
 * transaction's caller already having proven it via the job's own
 * assertCapability calls.
 */
export async function appendSystemMessage(
  db: Db,
  input: AppendSystemMessageInput,
): Promise<ConversationMessageRow> {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, input.conversationId)).limit(1);
  if (!conversation) throw new NotFoundError("Conversation", input.conversationId);

  const [message] = await db
    .insert(conversationMessages)
    .values({
      id: generateId(),
      conversationId: input.conversationId,
      appId: input.appId,
      role: input.messageType === "failure" || input.messageType === "system_status" || input.messageType === "validation_result" ? "system" : "assistant",
      messageType: input.messageType,
      content: input.content,
      modificationJobId: input.modificationJobId,
      diffSummary: input.diffSummary,
      impactClassification: input.impactClassification ?? null,
      confirmationState: input.confirmationState ?? "not_required",
      resultingVersionNumber: input.resultingVersionNumber,
      resultingPreviewBuildId: input.resultingPreviewBuildId,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
    })
    .returning();

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));

  return message;
}

/** Updates a message's confirmation state as a job's confirmation resolves (pending -> confirmed/expired). */
export async function updateMessageConfirmationState(
  db: Db,
  messageId: string,
  confirmationState: "not_required" | "pending" | "confirmed" | "expired",
): Promise<void> {
  await db.update(conversationMessages).set({ confirmationState }).where(eq(conversationMessages.id, messageId));
}

export async function findMessageByJobId(db: Db, appId: string, modificationJobId: string): Promise<ConversationMessageRow | null> {
  const [row] = await db
    .select()
    .from(conversationMessages)
    .where(and(eq(conversationMessages.appId, appId), eq(conversationMessages.modificationJobId, modificationJobId)))
    .limit(1);
  return row ?? null;
}
