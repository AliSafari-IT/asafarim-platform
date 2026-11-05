/**
 * Bot screening for the contact form (no captcha, nothing a real visitor sees).
 *
 * - `company` is an invisible honeypot field: people never fill it, form-filling bots do.
 * - `startedAt` is set by the browser when the form appears; a submission within
 *   `MIN_FILL_MS`, or without it, is a script, not a person typing.
 * - A name or message that is one long run of random mixed-case letters
 *   ("NEqMpoHHVxBfzlXovNdRd") is a bot probing the form.
 * - A message stuffed with links is spam.
 *
 * A screened submission gets the normal "sent" answer and sends nothing, so a bot
 * learns nothing. Per-client rate limiting is separate (`ContactRateLimiter`).
 */

/** A human needs at least this long to fill in a name, an email and a message. */
export const MIN_FILL_MS = 3_000;
/** A form left open longer than this sends no usable timing. */
export const MAX_FILL_MS = 24 * 60 * 60 * 1000;
/** More links than this in a project description is spam. */
export const MAX_LINKS = 3;

export type SpamReason =
  "honeypot" | "no_timing" | "too_fast" | "random_text" | "links";

export interface ContactSubmission {
  readonly name: string;
  readonly message: string;
  /** The honeypot field's value. */
  readonly honeypot: string;
  /** The `startedAt` field as sent: epoch milliseconds, as text. */
  readonly startedAt: string;
}

/**
 * One "word" of 10+ letters with no spaces and at least 3 capitals after the first
 * letter, and several case switches: generated, not typed. Real names and messages
 * ("McDonald", "IGS-Pharma", "JavaScript") have spaces or few switches.
 */
export function looksRandom(text: string): boolean {
  const value = text.trim();
  if (!/^[A-Za-z]{10,}$/.test(value)) return false;
  const innerCapitals = value.slice(1).replace(/[^A-Z]/g, "").length;
  let switches = 0;
  for (let i = 1; i < value.length; i++) {
    const upper = (c: string) => c >= "A" && c <= "Z";
    if (upper(value.charAt(i)) !== upper(value.charAt(i - 1))) switches++;
  }
  return innerCapitals >= 3 && switches >= 5;
}

const countLinks = (text: string): number =>
  (text.match(/https?:\/\/|www\./gi) ?? []).length;

/** Why this submission is a bot's, or `null` when it looks like a person's. */
export function spamReason(
  input: ContactSubmission,
  now: number = Date.now()
): SpamReason | null {
  if (input.honeypot.trim() !== "") return "honeypot";
  const started = /^\d{13}$/.test(input.startedAt)
    ? Number(input.startedAt)
    : Number.NaN;
  if (!Number.isFinite(started) || started > now || now - started > MAX_FILL_MS)
    return "no_timing";
  if (now - started < MIN_FILL_MS) return "too_fast";
  if (looksRandom(input.name) || looksRandom(input.message))
    return "random_text";
  if (countLinks(input.message) > MAX_LINKS) return "links";
  return null;
}

/**
 * At most `limit` messages per client per `windowMs`, kept in memory (one web
 * container; a restart forgets, which is fine for a contact form). Old entries are
 * dropped as the map is used, so it cannot grow without bound.
 */
export class ContactRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit = 3,
    readonly windowMs = 10 * 60 * 1000,
    private readonly maxClients = 10_000
  ) {}

  /** Records a message from `client` and says whether it is within the limit. */
  allow(client: string, now: number = Date.now()): boolean {
    const since = now - this.windowMs;
    const recent = (this.hits.get(client) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(client, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(client);
    this.hits.set(client, recent);
    // the oldest clients go first (a Map keeps insertion order)
    while (this.hits.size > this.maxClients) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return true;
  }
}
