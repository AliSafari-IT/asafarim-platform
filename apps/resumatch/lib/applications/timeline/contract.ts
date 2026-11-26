import { z } from "zod";
import { APPLICATION_STATUSES } from "../constants";
import { APPLICATION_NOTES_MAX_LENGTH, parseFollowUpDate } from "../patch";
import { isValidTimeZone, zonedLocalToUtc } from "../zonedTime";

/**
 * The request shapes for external submissions and timeline entries
 * (application-timeline.md). Client-safe: the forms use the same limits.
 *
 * Every time is sent as `{ local: "YYYY-MM-DDTHH:mm", timeZone }` and turned
 * into UTC here, on the server, so a client clock or offset can never put
 * an entry on another day. Unknown keys are refused, so a field this route
 * doesn't own (status, appliedAt) can't slip in.
 */

export const SUBMISSION_CHANNELS = ["INDEED", "LINKEDIN", "COMPANY_WEBSITE", "OTHER"] as const;
export type SubmissionChannelName = (typeof SUBMISSION_CHANNELS)[number];

export const EVENT_KINDS = [
  "SUBMITTED",
  "CONFIRMATION_RECEIVED",
  "RECRUITER_REPLY",
  "RESPONSE_SENT",
  "INTERVIEW",
  "FOLLOW_UP",
  "OFFER",
  "REJECTION",
  "NOTE",
] as const;
export type EventKindName = (typeof EVENT_KINDS)[number];

export const CHANNEL_LABEL_MAX = 80;
export const URL_MAX = 2048;
export const REFERENCE_MAX = 200;
export const PARTY_MAX = 320;
export const NEXT_ACTION_MAX = 500;
export const SUMMARY_MAX = APPLICATION_NOTES_MAX_LENGTH;
/** Client keys are random UUIDs; anything else is refused. */
const CLIENT_KEY = /^[A-Za-z0-9-]{8,64}$/;

/** A submission can't be later than now; a little slack covers clock skew. */
export const FUTURE_SLACK_MS = 10 * 60_000;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Only a real http(s) address: never `javascript:` or `data:`. */
export function normalizeHttpUrl(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > URL_MAX) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The saved job URL, when it is a real web address (manual, pasted and
 *  uploaded jobs carry `manual://` and the like). */
export function prefillApplicationUrl(sourceUrl: string | null | undefined): string | null {
  return sourceUrl ? normalizeHttpUrl(sourceUrl) : null;
}

const httpUrl = z
  .string()
  .max(URL_MAX)
  .transform((value, ctx) => {
    if (value.trim() === "") return null;
    const url = normalizeHttpUrl(value);
    if (!url) {
      ctx.addIssue({ code: "custom", message: "must be an http(s) address" });
      return z.NEVER;
    }
    return url;
  })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const zonedTimeSchema = z
  .object({ local: z.string().max(32), timeZone: z.string().max(64) })
  .strict()
  .transform((value, ctx) => {
    if (!isValidTimeZone(value.timeZone)) {
      ctx.addIssue({ code: "custom", message: "unknown time zone", path: ["timeZone"] });
      return z.NEVER;
    }
    const at = zonedLocalToUtc(value.local, value.timeZone);
    if (!at) {
      ctx.addIssue({ code: "custom", message: "must be a real date and time (YYYY-MM-DDTHH:mm)", path: ["local"] });
      return z.NEVER;
    }
    return { at, timeZone: value.timeZone };
  });

const followUpDay = z
  .string()
  .transform((value, ctx) => {
    if (value === "") return null;
    const date = parseFollowUpDate(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "must be a valid day (YYYY-MM-DD)" });
      return z.NEVER;
    }
    return date;
  })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const clientKey = z.string().regex(CLIENT_KEY);

const submissionFields = {
  appliedAt: zonedTimeSchema,
  channel: z.enum(SUBMISSION_CHANNELS),
  channelLabel: optionalText(CHANNEL_LABEL_MAX),
  applicationUrl: httpUrl,
  reference: optionalText(REFERENCE_MAX),
  notes: optionalText(SUMMARY_MAX),
};

function refuseFuture<T extends { appliedAt: { at: Date } }>(value: T, ctx: z.RefinementCtx, now: number) {
  if (value.appliedAt.at.getTime() > now + FUTURE_SLACK_MS) {
    ctx.addIssue({ code: "custom", message: "can't be in the future", path: ["appliedAt"] });
  }
}

/** "Mark as applied externally". */
export function recordSubmissionSchema(now = Date.now()) {
  return z
    .object({
      ...submissionFields,
      clientKey,
      followUpDate: followUpDay,
      /** Pasted confirmation text; with files it becomes a separate
       *  "Confirmation received" entry. */
      confirmationText: optionalText(SUMMARY_MAX),
      /** When the confirmation arrived; the applied time when left out. */
      confirmationAt: zonedTimeSchema.nullable().optional().transform((v) => v ?? null),
    })
    .strict()
    .superRefine((value, ctx) => refuseFuture(value, ctx, now));
}

/** "Edit recorded details": the same fields, never status or follow-up. */
export function editSubmissionSchema(now = Date.now()) {
  return z
    .object(submissionFields)
    .strict()
    .superRefine((value, ctx) => refuseFuture(value, ctx, now));
}

const eventFields = {
  kind: z.enum(EVENT_KINDS),
  occurredAt: zonedTimeSchema,
  summary: optionalText(SUMMARY_MAX),
  sender: optionalText(PARTY_MAX),
  recipient: optionalText(PARTY_MAX),
  nextAction: optionalText(NEXT_ACTION_MAX),
  followUpDate: followUpDay,
};

/** "Add update". `statusChange` is the only way an entry changes status;
 *  left out or null, the status stays where it is. */
export const createEventSchema = z
  .object({
    ...eventFields,
    clientKey,
    statusChange: z.enum(APPLICATION_STATUSES).nullable().optional().transform((v) => v ?? null),
  })
  .strict();

/** Editing an entry. The status change it made stays recorded as it was:
 *  status is corrected with the stepper, never by rewriting history. */
export const updateEventSchema = z.object(eventFields).strict();

export type RecordSubmissionInput = z.infer<ReturnType<typeof recordSubmissionSchema>>;
export type EditSubmissionInput = z.infer<ReturnType<typeof editSubmissionSchema>>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string; fields: string[] };

/** Field names only, never values: a rejected message must not end up in
 *  a response or a log line. */
export function parseWith<T>(schema: z.ZodType<T>, body: unknown): ParseResult<T> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object.", fields: [] };
  }
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, value: result.data };
  const fields = new Set<string>();
  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys") issue.keys.forEach((key) => fields.add(key));
    else if (typeof issue.path[0] === "string") fields.add(issue.path[0]);
  }
  const names = [...fields].sort();
  return { ok: false, error: names.length > 0 ? `Invalid field(s): ${names.join(", ")}.` : "Invalid request.", fields: names };
}
