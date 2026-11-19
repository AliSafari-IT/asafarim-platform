import { z } from "zod";
import { APPLICATION_STATUSES } from "./constants";

/**
 * The one accepted shape for `PATCH /api/applications/[id]` (issue #895).
 *
 * Before this, the route coerced any wrong-typed field to `null` (so
 * `{"notes": 42}` silently cleared the notes) and passed `new Date(x)`
 * straight to Prisma (so `{"followUpDate": "soon"}` failed in persistence
 * as a 500). Now every field is checked before the service runs, and the
 * three states a field can be in stay distinct:
 *
 * - omitted: left unchanged;
 * - `null`: cleared, and only for fields that are nullable in the schema
 *   (`status` is not, so `{"status": null}` is a 400);
 * - a value: validated, or the whole request is rejected with nothing
 *   written.
 *
 * Unknown keys, arrays, non-object JSON and an empty object are all 400s:
 * a request that would change nothing, or that names a field this route
 * doesn't own, is a client bug worth surfacing rather than a no-op.
 */

/** Generous ceiling for the candidate's own free text — far beyond any real
 *  note, small enough that a runaway client can't store megabytes. */
export const APPLICATION_NOTES_MAX_LENGTH = 20_000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar date (`YYYY-MM-DD`, stored as UTC midnight) or a full ISO
 *  8601 timestamp with an offset. Anything `new Date()` would merely
 *  guess at, such as "soon", "2026-02-30" or "11/19/2026", is rejected. */
export function parseFollowUpDate(value: string): Date | null {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    // Date.UTC rolls 2026-02-30 over to March 2; a real date round-trips.
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) {
      return null;
    }
    return date;
  }
  if (!z.iso.datetime({ offset: true }).safeParse(value).success) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const followUpDate = z
  .string()
  .transform((value, ctx) => {
    const date = parseFollowUpDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "must be a valid date (YYYY-MM-DD) or ISO 8601 timestamp" });
      return z.NEVER;
    }
    return date;
  })
  .nullable();

export const applicationPatchSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES),
    notes: z.string().max(APPLICATION_NOTES_MAX_LENGTH).nullable(),
    followUpDate,
    tailoredResumeId: z.string().trim().min(1).max(64).nullable(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: "no fields to update" });

export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;

export type ApplicationPatchResult =
  | { ok: true; patch: ApplicationPatch }
  /** `fields` names which keys were wrong, never their values: a rejected
   *  note must not end up in a log line or an error response. */
  | { ok: false; error: string; fields: string[] };

export function parseApplicationPatch(body: unknown): ApplicationPatchResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object.", fields: [] };
  }
  const result = applicationPatchSchema.safeParse(body);
  if (result.success) return { ok: true, patch: result.data };

  const fields = new Set<string>();
  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys") issue.keys.forEach((key) => fields.add(key));
    else if (typeof issue.path[0] === "string") fields.add(issue.path[0]);
  }
  const names = [...fields].sort();
  return {
    ok: false,
    error: names.length > 0 ? `Invalid field(s): ${names.join(", ")}.` : "No fields to update.",
    fields: names,
  };
}
