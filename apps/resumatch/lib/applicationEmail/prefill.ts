import { isValidRecipient, normalizeEmail } from "./normalize";

/**
 * Recipient prefill for a new draft (send-application.md). Only stored
 * facts are used, and nothing is ever guessed or built from a pattern
 * (no "jobs@<company domain>"):
 *
 * 1. the recipients of this application's last accepted email, all of
 *    them (#944);
 * 2. an address written in the job posting itself, when it names exactly
 *    one usable address (several: they are offered as suggestions, none is
 *    chosen);
 * 3. otherwise nothing, and the composer asks for it.
 *
 * The contact name comes from the job's own "contact" field (manual job
 * entry), or the last email's recipient name.
 */

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
/** Addresses that are never a person reading applications. */
const NOT_A_RECIPIENT = /^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|privacy|gdpr|dpo|abuse|unsubscribe|webmaster)@/i;
/** Image names like logo@2x.png look like addresses. */
const FILE_LIKE = /\.(?:png|jpe?g|gif|svg|webp|pdf|docx?)$/i;

export function emailsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Map<string, string>();
  for (const match of text.match(EMAIL_IN_TEXT) ?? []) {
    const address = match.replace(/^[._%+-]+|[._-]+$/g, "");
    if (NOT_A_RECIPIENT.test(address) || FILE_LIKE.test(address) || !isValidRecipient(address)) continue;
    const key = normalizeEmail(address);
    if (!seen.has(key)) seen.set(key, address);
  }
  return [...seen.values()];
}

export interface PrefillInput {
  structuredFields: unknown;
  rawText: string | null;
  previous: { contactEmail: string; contactName: string | null; additionalRecipients?: string[] } | null;
}

export interface Prefill {
  toEmail: string;
  /** Recipients 2 and 3 of the previous email; empty otherwise. */
  additionalToEmails: string[];
  contactName: string;
  /** Where the address came from, shown under the field. */
  toEmailSource: "previous_email" | "job_posting" | null;
  /** Addresses found in the posting when there was more than one. */
  suggestions: string[];
}

function structuredContactName(structuredFields: unknown): string | null {
  if (!structuredFields || typeof structuredFields !== "object") return null;
  const value = (structuredFields as Record<string, unknown>).contactName;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : null;
}

export function prefillRecipient(input: PrefillInput): Prefill {
  const jobContact = structuredContactName(input.structuredFields);
  if (input.previous) {
    return {
      toEmail: input.previous.contactEmail,
      additionalToEmails: input.previous.additionalRecipients ?? [],
      contactName: input.previous.contactName ?? jobContact ?? "",
      toEmailSource: "previous_email",
      suggestions: [],
    };
  }
  const found = emailsInText(input.rawText);
  if (found.length === 1) {
    return { toEmail: found[0]!, additionalToEmails: [], contactName: jobContact ?? "", toEmailSource: "job_posting", suggestions: [] };
  }
  return { toEmail: "", additionalToEmails: [], contactName: jobContact ?? "", toEmailSource: null, suggestions: found.slice(0, 5) };
}
