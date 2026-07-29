import { z } from "zod";
import { REFERENCE_LIMITS } from "../references/limits";

/**
 * POST /api/apps/{appId}/conversation/references/import request body.
 *
 * Deliberately NOT `z.string().url()`: Zod's URL check accepts `http:`,
 * `file:`, and credentials-bearing URLs, so accepting it here would make the
 * schema look like the security boundary when it is not. The real gate is
 * `lib/references/urlPolicy.ts#normalizeReferenceUrl`, which is also what
 * every redirect hop is re-checked against. This schema only bounds the
 * string's length and requires the scheme prefix so an obvious typo fails
 * before any work starts.
 */
export const ImportReferenceBody = z.object({
  url: z
    .string()
    .min("https://".length + 1)
    .max(REFERENCE_LIMITS.MAX_URL_LENGTH)
    .refine((value) => value.trim().toLowerCase().startsWith("https://"), {
      message: "Only https:// URLs can be imported.",
    }),
  /** Forces an outbound re-fetch even when the cached copy is still inside its TTL. */
  refresh: z.boolean().optional(),
});
export type ImportReferenceBodyType = z.infer<typeof ImportReferenceBody>;
