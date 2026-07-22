import { z } from "zod";
import { SelectionContext } from "../modification/selectionContext";
import { MODIFICATION_LIMITS } from "../modification/limits";

/** POST /api/apps/{appId}/conversation/messages request body — untrusted, validated before it ever reaches a repository. */
export const SendMessageBody = z.object({
  content: z.string().min(1).max(MODIFICATION_LIMITS.MAX_REQUEST_LENGTH),
  baseVersionNumber: z.number().int().nonnegative(),
  selectionContext: SelectionContext.nullable().optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
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
