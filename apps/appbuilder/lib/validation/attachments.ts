import { z } from "zod";
import { ATTACHMENT_LIMITS } from "../attachments/limits";

/** POST /api/apps/{appId}/conversation/attachments/init request body. */
export const InitAttachmentBody = z.object({
  originalFilename: z.string().min(1).max(ATTACHMENT_LIMITS.MAX_ORIGINAL_FILENAME_LENGTH),
  declaredMimeType: z.string().min(1).max(200),
  declaredSizeBytes: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});
export type InitAttachmentBodyType = z.infer<typeof InitAttachmentBody>;
