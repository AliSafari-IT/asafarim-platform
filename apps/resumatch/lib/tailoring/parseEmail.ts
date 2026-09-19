import { normalizeWhitespace } from "../extraction/text";

/**
 * Deterministic cleanup of a pasted job-invitation email (issue #459, part
 * of #458). A recruiter's email rarely IS the job description — it's a
 * greeting, a few paragraphs or a pasted posting, a signature block, and
 * often a quoted thread underneath. This strips the parts that are reliably
 * noise and makes a best-effort, confidence-free guess at a subject/sender
 * for `title`/`employer`, the same "shown for confirmation, never trusted"
 * posture `fetchJob.ts`'s `<title>`/`og:title` extraction already uses.
 *
 * Rule-based only, no model call — same JM-005 reasoning `profileExtractor.ts`
 * documents for CV parsing: this is structurally regular enough that a
 * model adds cost and a disclosure question without adding accuracy, and it
 * keeps email content (which may carry the recruiter's own PII) off any
 * provider entirely.
 */

const QUOTED_REPLY_MARKERS = [
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^On .{0,120} wrote:\s*$/im,
  /^Van:\s.*$/im, // Dutch Outlook "From:"
  /^De\s?:\s.*$/im, // French Outlook "From:"
];

const SIGNATURE_MARKERS = [/^--\s*$/m, /^Sent from my (iPhone|iPad|Android|Galaxy|Samsung)/im, /^Verstuurd vanaf mijn/im, /^Envoyé depuis mon/im];

const DISCLAIMER_MARKERS = [
  /This (e-?mail|message)( and any (files|attachments) transmitted with it)? (is|are) confidential[\s\S]*/i,
  /Please consider the environment before printing[\s\S]*/i,
  /This communication is intended solely for[\s\S]*/i,
];

const QUOTE_LINE = /^\s*>.*$/;

function cutAtFirstMatch(text: string, patterns: RegExp[]): string {
  let cut = text.length;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match.index < cut) cut = match.index;
  }
  return text.slice(0, cut);
}

function stripQuotedLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !QUOTE_LINE.test(line))
    .join("\n");
}

export interface ParsedEmail {
  /** Cleaned body text, ready for the same treatment `paste-job` gives
   *  candidate-typed text (normalized, length-capped by the caller). */
  rawText: string;
  /** Best-effort only — never trusted without candidate confirmation. */
  guessedTitle: string | null;
  guessedEmployer: string | null;
}

/**
 * `subject` is optional: a candidate pasting an email body alone (no
 * headers) still gets full cleanup, just no subject-derived title guess.
 */
export function parseJobInvitationEmail(text: string, subject?: string | null): ParsedEmail {
  let body = normalizeWhitespace(text);
  body = cutAtFirstMatch(body, QUOTED_REPLY_MARKERS);
  body = cutAtFirstMatch(body, SIGNATURE_MARKERS);
  body = cutAtFirstMatch(body, DISCLAIMER_MARKERS);
  body = stripQuotedLines(body);
  body = normalizeWhitespace(body);

  const fromLine = /^(?:From|Van|De)\s?:\s*(.+)$/im.exec(text)?.[1]?.trim() ?? null;
  const guessedEmployer = fromLine ? extractCompanyFromFromLine(fromLine) : null;

  const guessedTitle = subject ? cleanSubjectLine(subject) : null;

  return { rawText: body, guessedTitle, guessedEmployer };
}

/** A `From:` header/line is usually `Name <email@company.com>` or
 *  `Name (Company)` — pull whichever gives a plausible company name, or
 *  null rather than guessing wrong. */
function extractCompanyFromFromLine(fromLine: string): string | null {
  const parenMatch = /\(([^)]+)\)/.exec(fromLine);
  if (parenMatch) return parenMatch[1].trim().slice(0, 200) || null;

  const emailMatch = /@([a-z0-9.-]+)\./i.exec(fromLine);
  if (emailMatch) {
    const domain = emailMatch[1].replace(/^(mail|smtp|www)\./i, "");
    if (!/^(gmail|outlook|yahoo|hotmail|icloud|protonmail)$/i.test(domain)) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  }
  return null;
}

const SUBJECT_NOISE = /^(re|fwd?|fw)\s*:\s*/i;

function cleanSubjectLine(subject: string): string | null {
  let cleaned = subject.trim();
  // A forwarded/replied subject can carry several stacked prefixes.
  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(SUBJECT_NOISE, "").trim();
  } while (cleaned !== previous);
  return cleaned.slice(0, 300) || null;
}
