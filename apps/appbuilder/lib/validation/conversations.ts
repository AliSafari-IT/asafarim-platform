import { z } from "zod";
import { SelectionContext } from "../modification/selectionContext";
import { MODIFICATION_LIMITS } from "../modification/limits";
import { ATTACHMENT_LIMITS } from "../attachments/limits";

/**
 * POST /api/apps/{appId}/conversation/messages request body — untrusted,
 * validated before it ever reaches a repository.
 *
 * M13 slice C: `content` may now be empty when the message carries at least
 * one attachment ("send enabled when text or at least one ready attachment
 * exists" — docs/appbuilder-m13-multimodal-contextual-assistant.md,
 * Composer), so the non-empty requirement moved from `content` alone to the
 * refinement below. The `attachmentIds` cap is only a cheap shape check; the
 * authoritative per-message limit is re-enforced against real rows in
 * lib/repositories/attachments.ts#claimAttachmentsForMessageInTx.
 */
export const SendMessageBody = z
  .object({
    content: z.string().max(MODIFICATION_LIMITS.MAX_REQUEST_LENGTH),
    baseVersionNumber: z.number().int().nonnegative(),
    selectionContext: SelectionContext.nullable().optional(),
    attachmentIds: z.array(z.string().min(1).max(100)).max(ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE).optional(),
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .refine((body) => body.content.trim().length > 0 || (body.attachmentIds?.length ?? 0) > 0, {
    message: "A message needs text or at least one attachment.",
    path: ["content"],
  });
export type SendMessageBodyType = z.infer<typeof SendMessageBody>;

/** POST /api/apps/{appId}/modification-jobs/{jobId}/confirm request body. */
export const ConfirmModificationBody = z.object({
  checksum: z.string().min(1).max(200),
});

/** POST /api/apps/{appId}/specification/versions/{versionNumber}/restore request body. */
export const RestoreVersionBody = z.object({
  baseVersionNumber: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

/** POST /api/apps/{appId}/specification/operations/undo request body. */
export const UndoOperationBody = z.object({
  baseVersionNumber: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
