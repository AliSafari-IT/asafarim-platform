import { eq, lt } from "drizzle-orm";
import { deleteObject } from "@asafarim/storage";
import type { Db } from "../db/client";
import { conversationAttachments, validationArtifacts } from "../db/schema";
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
