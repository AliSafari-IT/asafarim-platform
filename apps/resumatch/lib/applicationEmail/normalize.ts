import { z } from "zod";

/**
 * Client-safe validation and normalization for application emails
 * (send-application.md). The same rules run in the composer, the draft
 * route and the send route, so what the browser accepts is what the server
 * sends.
 *
 * The message is plain text only: there is no HTML part, so nothing a
 * candidate (or a model) writes can become markup in the recipient's mail
 * client. Header fields (recipient name, subject) are single-line: any line
 * break or control character is rejected, which rules out header injection
 * before the mail library's own encoding is reached.
 */

export const SUBJECT_MAX_LENGTH = 200;
export const BODY_MAX_LENGTH = 10_000;
export const CONTACT_NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 254;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f\u2028\u2029]/;
// Tabs and line breaks are fine in a body; other control characters are not.
// eslint-disable-next-line no-control-regex
const BODY_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** One recipient address: no display name, no list, no comments. */
export function isValidRecipient(value: string): boolean {
  const email = value.trim();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return false;
  if (CONTROL_CHARS.test(email) || /[\s,;<>()"[\]\\]/.test(email)) return false;
  return z.email().safeParse(email).success;
}

/** The filter key for a recipient: trimmed and lower-cased. The local part
 *  is case-sensitive in theory and never in practice. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A single-line header value with its whitespace collapsed. */
export function cleanHeaderText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function hasControlChars(value: string): boolean {
  return CONTROL_CHARS.test(value);
}

/** Body text with Windows line endings unified and trailing space dropped. */
export function cleanBody(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
}

const LEGAL_SUFFIXES = new Set([
  "bv", "nv", "bvba", "vof", "cv", "comm", "vzw", "sprl", "srl", "sa", "sas", "sarl", "asbl", "scrl",
  "gmbh", "ag", "kg", "ug", "ltd", "limited", "llc", "llp", "inc", "incorporated", "corp", "corporation",
  "co", "company", "plc", "pty", "oy", "ab", "as", "aps", "spa", "sl",
]);

/**
 * A stable key for "the same company", stored on each sent email and used
 * by the company filter: accents folded, case and punctuation dropped,
 * trailing legal forms removed ("Kingfisher IT BV" and "kingfisher it" are
 * one company). Stored at send time, so a later change to this function
 * never moves an old email to another company.
 */
export function companyKey(name: string | null | undefined): string {
  const words = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    // Dotted abbreviations are one word: "B.V." is "bv", "S.A." is "sa".
    .replace(/(?<![\p{L}\p{N}])(?:\p{L}\.){2,}/gu, (m) => m.replace(/\./g, ""))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join("-") || "unknown";
}

export const DRAFT_FIELDS = [
  "toEmail",
  "contactName",
  "subject",
  "body",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** The editable fields, as the composer holds them. */
export interface EmailFields {
  toEmail: string;
  contactName: string;
  subject: string;
  body: string;
}

export type FieldProblem = "required" | "invalid" | "tooLong";

/**
 * Field problems for a send. A draft may be saved incomplete (an empty
 * recipient, no subject yet); a send may not. Returns an empty object when
 * everything is fine.
 */
export function validateForSend(fields: EmailFields): Partial<Record<DraftField, FieldProblem>> {
  const problems: Partial<Record<DraftField, FieldProblem>> = {};
  const to = fields.toEmail.trim();
  if (!to) problems.toEmail = "required";
  else if (!isValidRecipient(to)) problems.toEmail = "invalid";

  const name = fields.contactName.trim();
  if (name.length > CONTACT_NAME_MAX_LENGTH) problems.contactName = "tooLong";
  else if (hasControlChars(name) || /[<>"@]/.test(name)) problems.contactName = "invalid";

  const subject = fields.subject.trim();
  if (!subject) problems.subject = "required";
  else if (subject.length > SUBJECT_MAX_LENGTH) problems.subject = "tooLong";
  else if (hasControlChars(fields.subject)) problems.subject = "invalid";

  const body = cleanBody(fields.body);
  if (!body) problems.body = "required";
  else if (body.length > BODY_MAX_LENGTH) problems.body = "tooLong";
  else if (BODY_CONTROL_CHARS.test(body)) problems.body = "invalid";
  return problems;
}

/** The draft body a save accepts: every field optional and bounded, the
 *  same limits as a send, but nothing required. */
export const draftSaveSchema = z
  .object({
    toEmail: z.string().max(EMAIL_MAX_LENGTH),
    contactName: z.string().max(CONTACT_NAME_MAX_LENGTH),
    subject: z.string().max(SUBJECT_MAX_LENGTH),
    body: z.string().max(BODY_MAX_LENGTH),
    subjectEdited: z.boolean(),
    bodyEdited: z.boolean(),
    sendCopyToSelf: z.boolean(),
    cvPdfId: z.string().min(1).max(64).nullable(),
    coverLetterPdfId: z.string().min(1).max(64).nullable(),
    /** The draft version this edit started from; null for a new draft. */
    version: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((d) => !hasControlChars(d.subject) && !hasControlChars(d.contactName) && !hasControlChars(d.toEmail), {
    message: "header fields must be a single line",
  });

export type DraftSaveInput = z.infer<typeof draftSaveSchema>;

/** POST /api/applications/[id]/send: the draft as it stands, plus the
 *  client's key for this send intent. */
export const sendRequestSchema = z
  .object({
    draft: draftSaveSchema,
    /** A UUID the browser made for this one send. Retrying the same request
     *  (a lost response, a double click) reuses it. */
    idempotencyKey: z.uuid(),
  })
  .strict();

export type SendRequest = z.infer<typeof sendRequestSchema>;
