import { eq, inArray, lt } from "drizzle-orm";
import { deleteObject } from "@asafarim/storage";
import type { Db } from "../db/client";
import {
  conversationAttachments,
  conversationMemories,
  conversationMessages,
  validationArtifacts,
} from "../db/schema";
import { recordOperationalEvent } from "../observability/events";
import { findExpiredUnclaimedAttachments } from "../repositories/attachments";

export interface SweepResult {
  category: string;
  eligible: number;
  deleted: number;
  dryRun: boolean;
}

/**
 * The one category with real automated cleanup in M12 (see
 * lib/retention/policy.ts's docstring for why the others are eligibility-
 * reporting-only for now). Deletes the underlying storage object first,
 * then the row — if the storage delete fails, the row is left in place so
 * the next sweep retries rather than losing track of an orphaned object.
 */
export async function sweepExpiredValidationArtifacts(
  db: Db,
  options: { dryRun: boolean; now?: Date }
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const eligible = await db
    .select()
    .from(validationArtifacts)
    .where(lt(validationArtifacts.retentionExpiresAt, now));

  if (options.dryRun) {
    return {
      category: "validation_artifacts",
      eligible: eligible.length,
      deleted: 0,
      dryRun: true,
    };
  }

  let deleted = 0;
  for (const artifact of eligible) {
    await deleteObject(artifact.storageKey).catch(() => undefined);
    await db
      .delete(validationArtifacts)
      .where(eq(validationArtifacts.id, artifact.id));
    deleted += 1;
  }

  if (deleted > 0) {
    await recordOperationalEvent(db, {
      category: "storage",
      kind: "retention.swept",
      severity: "info",
      detail: { table: "validation_artifacts", deleted },
    });
  }

  return {
    category: "validation_artifacts",
    eligible: eligible.length,
    deleted,
    dryRun: false,
  };
}

const UNCLAIMED_ATTACHMENT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * M13 slice B: "Unclaimed uploads: delete within 24 hours" (docs/appbuilder-
 * m13-multimodal-contextual-assistant.md, Observability/privacy/quotas). An
 * attachment that never got claimed by a message (still `pending`,
 * `uploaded`, or stuck `processing`) 24h after it was initiated is
 * genuinely orphaned — hard-deleted, not archived, matching this same
 * sweep's convention for expired validation artifacts above. A `ready`,
 * `quarantined`, or already-`deleted` attachment is untouched here
 * regardless of age; `ready`/`quarantined` attachments follow the owning
 * conversation's own retention (never auto-expired by this sweep).
 */
export async function sweepUnclaimedAttachments(
  db: Db,
  options: { dryRun: boolean; now?: Date },
): Promise<SweepResult> {
  const now = options.now ?? new Date();
  const olderThan = new Date(now.getTime() - UNCLAIMED_ATTACHMENT_RETENTION_MS);
  const eligible = await findExpiredUnclaimedAttachments(db, olderThan);

  if (options.dryRun) {
    return { category: "conversation_attachments", eligible: eligible.length, deleted: 0, dryRun: true };
  }

  let deleted = 0;
  for (const attachment of eligible) {
    await deleteObject(attachment.storageKey).catch(() => undefined);
    if (attachment.thumbnailStorageKey) {
      await deleteObject(attachment.thumbnailStorageKey).catch(() => undefined);
    }
    await db.delete(conversationAttachments).where(eq(conversationAttachments.id, attachment.id));
    deleted += 1;

    // M13 slice G: one APP-SCOPED event per deleted row, in addition to the
    // aggregate below. The aggregate has no appId (the sweep is
    // platform-wide), so without these an app's own cleanup metrics and
    // cleanup-lag readiness could never see that anything was swept — the
    // signal would exist only in a log line nobody queries.
    await recordOperationalEvent(db, {
      appId: attachment.appId,
      correlationId: attachment.correlationId,
      category: "storage",
      kind: "attachment.swept_unclaimed",
      severity: "info",
      detail: {
        attachmentId: attachment.id,
        status: attachment.status,
        bytes: attachment.actualSizeBytes ?? attachment.declaredSizeBytes,
        ageHours: Math.round((now.getTime() - attachment.createdAt.getTime()) / 3_600_000),
      },
    });
  }

  if (deleted > 0) {
    await recordOperationalEvent(db, {
      category: "storage",
      kind: "retention.swept",
      severity: "info",
      detail: { table: "conversation_attachments", deleted },
    });
  }

  return { category: "conversation_attachments", eligible: eligible.length, deleted, dryRun: false };
}

/**
 * M13 slice G — "Delete memory when source messages are deleted"
 * (docs/appbuilder-m13-multimodal-contextual-assistant.md, Observability,
 * privacy, and quotas).
 *
 * A memory fact is a claim derived from specific conversation turns, and it
 * carries `sourceMessageIds` naming them. When every message that produced a
 * fact is gone, the fact is a derived copy of deleted content that would
 * keep influencing interpretation — so it must go too. That is the privacy
 * requirement; there is also a correctness one, since a fact whose evidence
 * cannot be inspected can never be checked by a human afterwards.
 *
 * Three deliberate bounds:
 *
 * - **Any surviving source keeps the fact.** A fact cited by three messages
 *   where one was deleted is still evidenced. Dropping it would silently
 *   degrade recall on a partial deletion.
 * - **A fact with no `sourceMessageIds` is kept.** Preferences are
 *   target-free and source-free by construction (see memory.ts) — treating
 *   "no sources listed" as "no sources exist" would delete exactly the facts
 *   that were never message-derived in the first place.
 * - **The row is rewritten, never deleted.** One row per conversation is a
 *   unique-indexed invariant; emptying its arrays is the correct "no memory"
 *   state, and deleting the row would just make the next write recreate it.
 */
export async function sweepOrphanedMemoryFacts(
  db: Db,
  options: { dryRun: boolean }
): Promise<SweepResult> {
  const rows = await db.select().from(conversationMemories);

  let eligible = 0;
  let deleted = 0;

  for (const row of rows) {
    const referencedIds = new Set<string>();
    for (const key of MEMORY_FACT_KEYS) {
      for (const fact of row[key]) {
        for (const id of sourceMessageIdsOf(fact)) referencedIds.add(id);
      }
    }
    if (referencedIds.size === 0) continue;

    const surviving = await db
      .select({ id: conversationMessages.id })
      .from(conversationMessages)
      .where(inArray(conversationMessages.id, [...referencedIds]));
    const survivingIds = new Set(surviving.map((m) => m.id));
    if (survivingIds.size === referencedIds.size) continue;

    const pruned: Record<(typeof MEMORY_FACT_KEYS)[number], Record<string, unknown>[]> = {
      references: [],
      assumptions: [],
      preferences: [],
    };
    let removedFacts = 0;
    for (const key of MEMORY_FACT_KEYS) {
      for (const fact of row[key]) {
        const sources = sourceMessageIdsOf(fact);
        const keep = sources.length === 0 || sources.some((id) => survivingIds.has(id));
        if (keep) pruned[key].push(fact);
        else removedFacts += 1;
      }
    }
    if (removedFacts === 0) continue;

    eligible += removedFacts;
    if (options.dryRun) continue;

    await db
      .update(conversationMemories)
      .set({
        ...pruned,
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(conversationMemories.id, row.id));
    deleted += removedFacts;

    await recordOperationalEvent(db, {
      appId: row.appId,
      category: "storage",
      kind: "retention.swept",
      severity: "info",
      detail: {
        table: "conversation_memories",
        conversationId: row.conversationId,
        removedFacts,
        reason: "source_messages_deleted",
      },
    });
  }

  return {
    category: "conversation_memories",
    eligible,
    deleted,
    dryRun: options.dryRun,
  };
}

const MEMORY_FACT_KEYS = ["references", "assumptions", "preferences"] as const;

function sourceMessageIdsOf(fact: Record<string, unknown>): string[] {
  const raw = fact.sourceMessageIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}
