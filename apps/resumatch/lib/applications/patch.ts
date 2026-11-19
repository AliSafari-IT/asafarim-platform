import { z } from "zod";
import { APPLICATION_STATUSES } from "./constants";
import { followUpDayToDate, parseFollowUpDay } from "./followUp";

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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The day a follow-up date names, stored as that day at 00:00 UTC (see
 *  lib/applications/followUp.ts, issue #896). Two input forms:
 *
 * - `YYYY-MM-DD`, what the UI sends;
 * - an ISO 8601 timestamp with an offset, kept for API callers. It names
 *   the day as written, in its own offset: "2026-12-01T23:30:00-05:00" is
 *   1 December, not the 2 December it is in UTC. The time is dropped.
 *
 * Anything `new Date()` would merely guess at ("soon", "2026-02-30",
 * "11/19/2026"), a timestamp without an offset, and a day outside
 * FOLLOW_UP_MIN_DAY..FOLLOW_UP_MAX_DAY are rejected. */
export function parseFollowUpDate(value: string): Date | null {
  let day = value;
  if (!DATE_ONLY.test(value)) {
    if (!z.iso.datetime({ offset: true }).safeParse(value).success) return null;
    day = value.slice(0, 10);
  }
  const valid = parseFollowUpDay(day);
  return valid ? followUpDayToDate(valid) : null;
}

const followUpDate = z
  .string()
  .transform((value, ctx) => {
    const date = parseFollowUpDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "must be a valid day (YYYY-MM-DD) between 2000 and 2100" });
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
