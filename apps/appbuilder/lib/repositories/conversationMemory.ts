import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { conversationMemories } from "../db/schema";
import { generateId } from "../db/ids";
import type { SpecIndex } from "../modification/specIndex";
import {
  emptyMemoryFacts,
  forgetSourceMessages,
  invalidateStaleFacts,
  rememberAssumption,
  rememberPreference,
  rememberReference,
  type ConversationMemoryFacts,
  type MemoryAssumption,
  type MemoryPreference,
  type MemoryReference,
  type RecalledMemory,
} from "../modification/memory";

/**
 * M13 slice D — durable, evidence-linked conversation memory.
 *
 * There is exactly one row per conversation and it is rewritten in place:
 * memory is *current state*, and the conversation messages remain the
 * append-only history it cites. The pure fact algebra (bounding,
 * de-duplication, invalidation) lives in lib/modification/memory.ts so it is
 * unit-testable without Postgres; this module only persists the result.
 *
 * No `assertCapability` call here on purpose, matching
 * `appendSystemMessage`'s established convention (lib/repositories/
 * conversations.ts): every caller is the modification pipeline running as
 * the job's own trusted initiating actor, which has already proven app
 * access through the job's enqueue-time check. There is no route that
 * reaches these functions from a client request. If one is ever added, it
 * must carry its own `app.viewConversation` / `app.requestModification`
 * check — the memory row contains user-authored phrases and specification
 * values and is not public.
 */

export type ConversationMemoryRow = typeof conversationMemories.$inferSelect;

export interface StoredMemory {
  conversationId: string;
  revision: number;
  specificationVersionNumber: number;
  facts: ConversationMemoryFacts;
}

function rowToStored(row: ConversationMemoryRow): StoredMemory {
  return {
    conversationId: row.conversationId,
    revision: row.revision,
    specificationVersionNumber: row.specificationVersionNumber,
    facts: {
      references: (row.references ?? []) as unknown as MemoryReference[],
      assumptions: (row.assumptions ?? []) as unknown as MemoryAssumption[],
      preferences: (row.preferences ?? []) as unknown as MemoryPreference[],
    },
  };
}

/** Reads the raw persisted memory, without invalidating anything. Prefer `recallConversationMemory` for anything that will reach a model. */
export async function loadConversationMemory(db: Db, conversationId: string): Promise<StoredMemory | null> {
  const [row] = await db
    .select()
    .from(conversationMemories)
    .where(eq(conversationMemories.conversationId, conversationId))
    .limit(1);
  return row ? rowToStored(row) : null;
}

/**
 * The read path every interpretation uses: load, then verify every fact
 * against the CURRENT specification index and drop what no longer holds.
 *
 * Invalidation is applied on read rather than on spec change so it can never
 * be missed — a specification can move through any number of versions, via
 * any path (a modification job, a direct operation, a rollback), without
 * anyone having to remember to sweep memory. A stale fact simply cannot
 * survive being recalled.
 */
export async function recallConversationMemory(
  db: Db,
  conversationId: string,
  index: SpecIndex,
): Promise<RecalledMemory> {
  const stored = await loadConversationMemory(db, conversationId);
  if (!stored) return { facts: emptyMemoryFacts(), invalidated: [] };
  return invalidateStaleFacts(stored.facts, index);
}

async function writeFacts(
  db: Db,
  appId: string,
  conversationId: string,
  specificationVersionNumber: number,
  mutate: (facts: ConversationMemoryFacts) => ConversationMemoryFacts,
): Promise<StoredMemory> {
  const existing = await loadConversationMemory(db, conversationId);
  const next = mutate(existing?.facts ?? emptyMemoryFacts());

  if (!existing) {
    const [created] = await db
      .insert(conversationMemories)
      .values({
        id: generateId(),
        appId,
        conversationId,
        revision: 1,
        specificationVersionNumber,
        references: next.references as unknown as Record<string, unknown>[],
        assumptions: next.assumptions as unknown as Record<string, unknown>[],
        preferences: next.preferences as unknown as Record<string, unknown>[],
      })
      .returning();
    return rowToStored(created);
  }

  const [updated] = await db
    .update(conversationMemories)
    .set({
      revision: existing.revision + 1,
      specificationVersionNumber,
      references: next.references as unknown as Record<string, unknown>[],
      assumptions: next.assumptions as unknown as Record<string, unknown>[],
      preferences: next.preferences as unknown as Record<string, unknown>[],
      updatedAt: new Date(),
    })
    .where(eq(conversationMemories.conversationId, conversationId))
    .returning();
  return rowToStored(updated);
}

export interface RecordReferenceInput {
  appId: string;
  conversationId: string;
  specificationVersionNumber: number;
  reference: MemoryReference;
}

/** Binds a phrase the user used to the stable target it was resolved to, with the value that target held at the time (the staleness probe). */
export function recordResolvedReference(db: Db, input: RecordReferenceInput): Promise<StoredMemory> {
  return writeFacts(db, input.appId, input.conversationId, input.specificationVersionNumber, (facts) =>
    rememberReference(facts, input.reference),
  );
}

export interface RecordAssumptionInput {
  appId: string;
  conversationId: string;
  specificationVersionNumber: number;
  assumption: MemoryAssumption;
}

export function recordAssumption(db: Db, input: RecordAssumptionInput): Promise<StoredMemory> {
  return writeFacts(db, input.appId, input.conversationId, input.specificationVersionNumber, (facts) =>
    rememberAssumption(facts, input.assumption),
  );
}

export interface RecordPreferenceInput {
  appId: string;
  conversationId: string;
  specificationVersionNumber: number;
  preference: MemoryPreference;
}

export function recordPreference(db: Db, input: RecordPreferenceInput): Promise<StoredMemory> {
  return writeFacts(db, input.appId, input.conversationId, input.specificationVersionNumber, (facts) =>
    rememberPreference(facts, input.preference),
  );
}

/**
 * Drops every fact whose only evidence was a now-deleted message. M13's
 * privacy contract requires "delete memory when source messages are
 * deleted" — a fact that outlives its citation is exactly the uncorrectable
 * summary this design rejects.
 */
export async function forgetDeletedMessages(
  db: Db,
  appId: string,
  conversationId: string,
  deletedMessageIds: readonly string[],
): Promise<StoredMemory | null> {
  const existing = await loadConversationMemory(db, conversationId);
  if (!existing) return null;
  return writeFacts(db, appId, conversationId, existing.specificationVersionNumber, (facts) =>
    forgetSourceMessages(facts, deletedMessageIds),
  );
}
