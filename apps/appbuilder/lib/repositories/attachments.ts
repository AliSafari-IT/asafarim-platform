import { and, asc, eq, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import { buildKey, deleteObject, getObjectBytes, putObjectBytes } from "@asafarim/storage";
import { createHash } from "node:crypto";
import type { Db } from "../db/client";
import { conversationAttachments } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { ensureConversation } from "./conversationThread";
import { generateId } from "../db/ids";
import { checksumOf } from "../db/hash";
import { ConflictError, NotFoundError } from "../errors";
import {
  ATTACHMENT_LIMITS,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  categoryForMimeType,
  maxBytesForMimeType,
} from "../attachments/limits";
import {
  AttachmentAccessDeniedError,
  AttachmentAlreadyClaimedError,
  AttachmentMismatchError,
  AttachmentNotReadyError,
  AttachmentScanFailedError,
  AttachmentTooLargeError,
  TooManyAttachmentsError,
  UnsupportedAttachmentTypeError,
} from "../attachments/errors";
import { processAttachmentContent } from "../attachments/process";
import { withQuota } from "../quotas/enforce";
import { sumAttachmentBytesForApp, countAttachmentsForApp } from "../quotas/usage";
import { withQuotaRejectionLogging } from "../observability/events";
import { recordOperationalEvent } from "../observability/events";

/**
 * M13 slice B — the conversation-attachment lifecycle. `storageKey` and
 * `thumbnailStorageKey` are NEVER included in anything this module returns
 * to a caller (see `toSafeAttachment`) — deliberately stricter than M09's
 * `lib/generated-data/files.ts#initUpload`, which does return its storage
 * key, because M13 explicitly requires "Raw storage keys are never
 * returned" (docs/appbuilder-m13-multimodal-contextual-assistant.md, APIs).
 * A route that needs to act on the underlying object (the content-upload
 * route) looks it up server-side from the attachment id instead.
 *
 * Extraction/scanning (lib/attachments/process.ts) runs synchronously
 * in-process inside `commitAttachmentContent`, not through a separate
 * queue/worker — see that module's docstring for why that is a deliberate,
 * bounded scope decision for this slice rather than an omission.
 */
export type ConversationAttachmentRow = typeof conversationAttachments.$inferSelect;

/** The public-safe projection of an attachment row — storage keys stripped. */
export interface SafeAttachment {
  id: string;
  appId: string;
  conversationId: string;
  messageId: string | null;
  uploadedByPrincipalId: string;
  originalFilename: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
  detectedMimeType: string | null;
  actualSizeBytes: number | null;
  status: ConversationAttachmentRow["status"];
  extractionKind: string | null;
  hasThumbnail: boolean;
  failureCode: ConversationAttachmentRow["failureCode"];
  failureMessage: string | null;
  createdAt: Date;
  uploadedAt: Date | null;
  processedAt: Date | null;
}

export function toSafeAttachment(row: ConversationAttachmentRow): SafeAttachment {
  return {
    id: row.id,
    appId: row.appId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    uploadedByPrincipalId: row.uploadedByPrincipalId,
    originalFilename: row.originalFilename,
    declaredMimeType: row.declaredMimeType,
    declaredSizeBytes: row.declaredSizeBytes,
    detectedMimeType: row.detectedMimeType,
    actualSizeBytes: row.actualSizeBytes,
    status: row.status,
    extractionKind: row.extractionKind,
    hasThumbnail: Boolean(row.thumbnailStorageKey),
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    createdAt: row.createdAt,
    uploadedAt: row.uploadedAt,
    processedAt: row.processedAt,
  };
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/json": "json",
    "text/csv": "csv",
  };
  return map[mimeType] ?? "bin";
}

export interface InitAttachmentInput {
  originalFilename: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
  idempotencyKey: string;
}

/**
 * Validates the declared type/size against the M13 catalogue, mints a
 * server-generated storage key, and inserts a `pending` row — no bytes
 * exist yet. Ensures the app's conversation exists (an attachment may be
 * initiated before any message references it).
 */
export async function initAttachment(
  db: Db,
  actor: Actor,
  appId: string,
  input: InitAttachmentInput,
): Promise<SafeAttachment> {
  await assertCapability(db, actor, appId, "app.uploadAttachment");

  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(input.declaredMimeType)) {
    throw new UnsupportedAttachmentTypeError(input.declaredMimeType);
  }
  const maxBytes = maxBytesForMimeType(input.declaredMimeType)!;
  if (input.declaredSizeBytes <= 0 || input.declaredSizeBytes > maxBytes) {
    throw new AttachmentTooLargeError(maxBytes);
  }

  const requestHash = checksumOf({
    originalFilename: input.originalFilename,
    declaredMimeType: input.declaredMimeType,
    declaredSizeBytes: input.declaredSizeBytes,
  });

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(conversationAttachments)
      .where(and(eq(conversationAttachments.appId, appId), eq(conversationAttachments.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError("Idempotency key reused with a different request payload");
      }
      return toSafeAttachment(existing);
    }

    const conversation = await ensureConversation(tx, appId, actor);
    const storageKey = buildKey(`conversations/${appId}/${conversation.id}`, mimeToExt(input.declaredMimeType));

    const [row] = await tx
      .insert(conversationAttachments)
      .values({
        id: generateId(),
        appId,
        conversationId: conversation.id,
        uploadedByPrincipalId: actor.principalId,
        originalFilename: input.originalFilename.slice(0, ATTACHMENT_LIMITS.MAX_ORIGINAL_FILENAME_LENGTH),
        declaredMimeType: input.declaredMimeType,
        declaredSizeBytes: input.declaredSizeBytes,
        storageKey,
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        requestHash,
      })
      .returning();

    return toSafeAttachment(row);
  });
}

async function loadOwnAttachmentRow(db: Db, appId: string, attachmentId: string): Promise<ConversationAttachmentRow> {
  const [row] = await db
    .select()
    .from(conversationAttachments)
    .where(and(eq(conversationAttachments.id, attachmentId), eq(conversationAttachments.appId, appId)))
    .limit(1);
  if (!row) throw new NotFoundError("Attachment", attachmentId);
  return row;
}

/**
 * Persists the bytes for a previously-initiated attachment: re-verifies the
 * actual length against what was declared, sniffs the real content (never
 * trusting the declared MIME alone), runs it through the scan/extraction
 * boundary, enforces the per-app storage quota, and only THEN writes to
 * private object storage. Only the original uploader may commit; only once
 * per attachment (a retried commit against an already-committed row is a
 * `ConflictError`, matching M09's `commitUpload` contract exactly).
 */
export async function commitAttachmentContent(
  db: Db,
  actor: Actor,
  appId: string,
  attachmentId: string,
  bytes: Buffer,
): Promise<SafeAttachment> {
  await assertCapability(db, actor, appId, "app.uploadAttachment");
  const attachment = await loadOwnAttachmentRow(db, appId, attachmentId);
  if (attachment.uploadedByPrincipalId !== actor.principalId) throw new AttachmentAccessDeniedError();
  if (attachment.status !== "pending") {
    throw new ConflictError("This attachment has already been committed, processed, or deleted.");
  }
  if (bytes.length !== attachment.declaredSizeBytes) {
    throw new AttachmentMismatchError("Uploaded byte count does not match the declared size.");
  }

  // Sniff/scan/extract BEFORE any storage write or quota consumption — an
  // unrecognized format, MIME mismatch, polyglot, encrypted PDF, animated
  // GIF, or (production) unconfigured scanner must reject the commit
  // outright, leaving the row `pending` and nothing persisted, rather than
  // landing a partially-processed row.
  const processed = await processAttachmentContent(bytes, attachment.declaredMimeType);

  await withQuotaRejectionLogging(
    db,
    { category: "storage", appId, actorPrincipalId: actor.principalId },
    () =>
      db.transaction((tx) =>
        withQuota(
          tx,
          appId,
          "attachment_bytes_per_app",
          // NOT "+ bytes.length": this row is already `pending` with its
          // declaredSizeBytes (== bytes.length, verified above) counted by
          // sumAttachmentBytesForApp's fallback — adding bytes.length again
          // would double-count the very upload being committed. Contrast
          // with M09's commitUpload, which sums only already-`committed`
          // files and so DOES need "+ file.sizeBytes" for the one being
          // committed now.
          async () => sumAttachmentBytesForApp(tx, appId),
          async () => undefined,
        ),
      ),
  );
  await withQuotaRejectionLogging(
    db,
    { category: "storage", appId, actorPrincipalId: actor.principalId },
    () =>
      db.transaction((tx) =>
        withQuota(
          tx,
          appId,
          "attachments_per_app",
          async () => countAttachmentsForApp(tx, appId),
          async () => undefined,
        ),
      ),
  );

  await putObjectBytes(attachment.storageKey, bytes, processed.detectedMimeType, { acl: "private" });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const now = new Date();

  if (processed.scan.verdict === "not_configured") {
    await recordOperationalEvent(db, {
      appId,
      category: "security",
      kind: "attachment.scan_not_configured",
      severity: "warning",
      actorPrincipalId: actor.principalId,
      detail: { attachmentId },
    });
  }

  if (processed.scan.verdict === "flagged") {
    const [quarantined] = await db
      .update(conversationAttachments)
      .set({
        status: "quarantined",
        detectedMimeType: processed.detectedMimeType,
        actualSizeBytes: bytes.length,
        sha256,
        failureCode: "malware_detected",
        failureMessage: "This file was flagged by content scanning and cannot be used.",
        uploadedAt: now,
        processedAt: now,
      })
      .where(eq(conversationAttachments.id, attachmentId))
      .returning();
    await recordOperationalEvent(db, {
      appId,
      category: "security",
      kind: "attachment.quarantined",
      severity: "warning",
      actorPrincipalId: actor.principalId,
      detail: { attachmentId, adapter: processed.scan.adapterName },
    });
    return toSafeAttachment(quarantined);
  }

  const [ready] = await db
    .update(conversationAttachments)
    .set({
      status: "ready",
      detectedMimeType: processed.detectedMimeType,
      actualSizeBytes: bytes.length,
      sha256,
      extractionKind: processed.extractionKind,
      extractionVersion: processed.extractionVersion,
      extractedText: processed.extractedText,
      pageCount: processed.pageCount,
      widthPx: processed.widthPx,
      heightPx: processed.heightPx,
      uploadedAt: now,
      processedAt: now,
    })
    .where(eq(conversationAttachments.id, attachmentId))
    .returning();
  return toSafeAttachment(ready);
}

/** Cross-app/unrelated-actor access is indistinguishable NotFoundError, same as every other app-scoped read (see authz.ts#assertCapability's docstring). */
export async function getAttachmentForActor(db: Db, actor: Actor, appId: string, attachmentId: string): Promise<SafeAttachment> {
  await assertCapability(db, actor, appId, "app.viewAttachment");
  return toSafeAttachment(await loadOwnAttachmentRow(db, appId, attachmentId));
}

/**
 * Every attachment this actor may see in the app's conversation panel:
 * each one already CLAIMED by a message (conversation history — visible to
 * anyone who can view the conversation, exactly like the messages they hang
 * off), plus this actor's OWN not-yet-claimed uploads (their in-progress
 * composer draft). Another editor's unsent draft is deliberately excluded —
 * an upload becomes shared history only when a message claims it.
 *
 * Soft-deleted tombstones are filtered out here rather than being returned
 * with a `deleted` status for the client to hide, so a removed attachment
 * cannot resurface in any UI that forgets to check.
 */
export async function listConversationAttachmentsForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<SafeAttachment[]> {
  await assertCapability(db, actor, appId, "app.viewAttachment");
  const rows = await db
    .select()
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        ne(conversationAttachments.status, "deleted"),
        or(
          isNotNull(conversationAttachments.messageId),
          eq(conversationAttachments.uploadedByPrincipalId, actor.principalId),
        ),
      ),
    )
    .orderBy(asc(conversationAttachments.createdAt));
  return rows.map(toSafeAttachment);
}

/** The attachments a single message claimed, oldest first — used by the send response so the client can render the new message's cards without a second round trip. */
export async function listAttachmentsForMessage(
  db: Db,
  actor: Actor,
  appId: string,
  messageId: string,
): Promise<SafeAttachment[]> {
  await assertCapability(db, actor, appId, "app.viewAttachment");
  const rows = await db
    .select()
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        eq(conversationAttachments.messageId, messageId),
        ne(conversationAttachments.status, "deleted"),
      ),
    )
    .orderBy(asc(conversationAttachments.createdAt));
  return rows.map(toSafeAttachment);
}

/**
 * M13 slice D — the attachments claimed by a set of messages, WITH their
 * bounded extracted text, for the modification pipeline's context assembler.
 *
 * Deliberately separate from `listAttachmentsForMessage` above, which
 * returns `SafeAttachment` (no extracted text) to clients. This one returns
 * the raw rows and takes no `Actor`: like `appendSystemMessage`, its only
 * caller is the worker running as the job's own trusted initiating actor,
 * which already proved app access at enqueue time. Two consequences that
 * must stay true — (a) nothing here may be wired to a route without adding
 * a capability check, and (b) `storageKey`/`thumbnailStorageKey` still never
 * leave the server: the assembler reads `extractedText` and metadata only,
 * and never forwards a key.
 *
 * Only `ready` attachments carry usable text; the rest are returned too, so
 * the assembler can DISCLOSE that evidence existed but was unusable rather
 * than silently pretending the user attached nothing.
 */
export async function listAttachmentEvidenceForMessages(
  db: Db,
  appId: string,
  messageIds: readonly string[],
): Promise<ConversationAttachmentRow[]> {
  if (messageIds.length === 0) return [];
  return db
    .select()
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        inArray(conversationAttachments.messageId, [...messageIds]),
        ne(conversationAttachments.status, "deleted"),
      ),
    )
    .orderBy(asc(conversationAttachments.createdAt));
}

export interface AttachmentContent {
  bytes: Buffer;
  /** The SNIFFED type (never the declared one) — what the bytes actually are. */
  contentType: string;
  filename: string;
}

/**
 * Reads an attachment's stored bytes for a viewer — the read side of the
 * "raw storage keys are never returned" rule: the key is resolved
 * server-side from the attachment id and never leaves this process, so a
 * thumbnail/preview URL is an app-scoped, capability-checked route rather
 * than a storage URL the client could share or enumerate.
 *
 * Only `ready` attachments are readable: `pending`/`uploaded` have no
 * complete object yet, and `quarantined`/`failed` content must never be
 * served back — the card shows the failure instead.
 */
export async function readAttachmentContentForActor(
  db: Db,
  actor: Actor,
  appId: string,
  attachmentId: string,
): Promise<AttachmentContent> {
  await assertCapability(db, actor, appId, "app.viewAttachment");
  const row = await loadOwnAttachmentRow(db, appId, attachmentId);
  if (row.status !== "ready") throw new AttachmentNotReadyError(attachmentId, row.status);
  const object = await getObjectBytes(row.storageKey);
  if (!object) throw new NotFoundError("Attachment", attachmentId);
  return {
    // The row's sniffed type wins over whatever the storage backend reports
    // for the object — it is the one value derived from the bytes by code
    // we control (lib/attachments/sniff.ts).
    bytes: object.body,
    contentType: row.detectedMimeType ?? "application/octet-stream",
    filename: row.originalFilename,
  };
}

/**
 * Soft-deletes an attachment: removes the storage object(s) and marks the
 * row `deleted` (never hard-deleted, so audit history and any message that
 * already referenced it survive — see docs/appbuilder-m13-...md's
 * "owner-visible attachment deletion and audit evidence"). The original
 * uploader may delete their own upload; an owner may delete any attachment
 * on the app. Idempotent: deleting an already-deleted attachment is a no-op.
 */
export async function deleteAttachment(db: Db, actor: Actor, appId: string, attachmentId: string): Promise<SafeAttachment> {
  const access = await assertCapability(db, actor, appId, "app.uploadAttachment");
  const attachment = await loadOwnAttachmentRow(db, appId, attachmentId);
  if (attachment.uploadedByPrincipalId !== actor.principalId && access.role !== "owner") {
    throw new AttachmentAccessDeniedError();
  }
  if (attachment.status === "deleted") return toSafeAttachment(attachment);

  await deleteObject(attachment.storageKey).catch(() => undefined);
  if (attachment.thumbnailStorageKey) {
    await deleteObject(attachment.thumbnailStorageKey).catch(() => undefined);
  }

  const [deleted] = await db
    .update(conversationAttachments)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(eq(conversationAttachments.id, attachmentId))
    .returning();
  return toSafeAttachment(deleted);
}

/**
 * The claim itself, running inside a transaction the CALLER owns. M13 slice
 * C sends attachments with a message, and the spec requires those to be
 * "claimed transactionally with message/job creation" — so the message
 * insert and this claim must share one transaction, or a rejected claim
 * would leave a sent message whose attachments silently vanished. That is
 * why the transaction boundary lives with the caller
 * (lib/repositories/conversations.ts#appendUserMessage) rather than here.
 * Every throw below therefore rolls the message back too.
 */
async function claimAttachmentsInTx(
  tx: Db,
  actor: Actor,
  appId: string,
  conversationId: string,
  messageId: string,
  attachmentIds: readonly string[],
): Promise<SafeAttachment[]> {
  const rows = await tx
    .select()
    .from(conversationAttachments)
    .where(and(eq(conversationAttachments.appId, appId), inArray(conversationAttachments.id, [...attachmentIds])));

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of attachmentIds) {
    const row = byId.get(id);
    if (!row || row.conversationId !== conversationId) throw new NotFoundError("Attachment", id);
    if (row.uploadedByPrincipalId !== actor.principalId) throw new AttachmentAccessDeniedError();
    if (row.messageId) throw new AttachmentAlreadyClaimedError(id);
    if (row.status !== "ready") {
      if (row.status === "quarantined") throw new AttachmentScanFailedError(`Attachment ${id} was flagged by content scanning.`);
      throw new AttachmentNotReadyError(id, row.status);
    }
  }

  const claimed: ConversationAttachmentRow[] = [];
  for (const id of attachmentIds) {
    const [updated] = await tx
      .update(conversationAttachments)
      .set({ messageId })
      .where(and(eq(conversationAttachments.id, id), eq(conversationAttachments.appId, appId)))
      .returning();
    claimed.push(updated);
  }
  return claimed.map(toSafeAttachment);
}

/**
 * Validates a claim request's shape and authorization, then runs it in the
 * caller's transaction. Split from `claimAttachmentsForMessage` so the
 * send-a-message path (which already holds a transaction) can reuse the
 * exact same rules without nesting a second one — the capability check runs
 * against `tx` too, so a revoked capability is seen at the same isolation
 * level as the rows being claimed.
 */
export async function claimAttachmentsForMessageInTx(
  tx: Db,
  actor: Actor,
  appId: string,
  conversationId: string,
  messageId: string,
  attachmentIds: readonly string[],
): Promise<SafeAttachment[]> {
  if (attachmentIds.length === 0) return [];
  await assertCapability(tx, actor, appId, "app.uploadAttachment");
  if (attachmentIds.length > ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new TooManyAttachmentsError(ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE);
  }
  if (new Set(attachmentIds).size !== attachmentIds.length) {
    throw new ConflictError("The same attachment was listed more than once.");
  }
  return claimAttachmentsInTx(tx, actor, appId, conversationId, messageId, attachmentIds);
}

/**
 * Atomically claims one or more `ready` attachments for a message being
 * sent — the "claimed by exactly one message at send time" contract (M13
 * data model). Ownership and app/conversation scope are rechecked here
 * (never trusted from an earlier request); an attachment already claimed by
 * another message, not owned by this actor, not `ready`, or not belonging
 * to this app/conversation fails the WHOLE claim — never a partial claim.
 *
 * Standalone entry point (owns its transaction). The send path uses
 * `claimAttachmentsForMessageInTx` instead so the claim shares the
 * message's transaction.
 */
export async function claimAttachmentsForMessage(
  db: Db,
  actor: Actor,
  appId: string,
  conversationId: string,
  messageId: string,
  attachmentIds: readonly string[],
): Promise<SafeAttachment[]> {
  if (attachmentIds.length === 0) {
    await assertCapability(db, actor, appId, "app.uploadAttachment");
    return [];
  }
  return db.transaction((tx) => claimAttachmentsForMessageInTx(tx, actor, appId, conversationId, messageId, attachmentIds));
}

/** Unclaimed uploads (never attached to a message) older than the retention window — see lib/retention/sweep.ts#sweepUnclaimedAttachments. */
export async function findExpiredUnclaimedAttachments(db: Db, olderThan: Date): Promise<ConversationAttachmentRow[]> {
  return db
    .select()
    .from(conversationAttachments)
    .where(
      and(
        inArray(conversationAttachments.status, ["pending", "uploaded", "processing"]),
        lt(conversationAttachments.createdAt, olderThan),
      ),
    );
}
