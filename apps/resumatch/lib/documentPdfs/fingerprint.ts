import { createHash } from "node:crypto";

/**
 * What a rendered PDF was made from, as one hash (send-application.md).
 *
 * A PDF is a snapshot. When the CV or letter it came from changes later
 * (a photo switched on, another skills layout, a new profile version), the
 * old PDF stays exactly as it was — it may already have been sent — and
 * the source's fingerprint simply stops matching it. The composer then says
 * the attachment is older than the document and lets the candidate make a
 * new one; it never swaps it silently.
 *
 * The inputs are the stored values the page renders from. Template or
 * stylesheet changes in a later release are deliberately not part of it: a
 * PDF made before them is still a faithful copy of what the candidate
 * approved.
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function hash(kind: string, parts: Record<string, unknown>): string {
  return createHash("sha256").update(`${kind}@1:${stableStringify(parts)}`).digest("hex");
}

export interface CvFingerprintInput {
  content: unknown;
  outputLanguage: string | null;
  skillsLayout: string | null;
  skillsParagraph: string | null;
  /** The profile version the CV was made from (skill categories, links). */
  profileVersionContent: unknown;
  /** The photo as shown on this CV, or null when it shows none. */
  photo: { contentHash: string; shape: string } | null;
}

export function cvFingerprint(input: CvFingerprintInput): string {
  return hash("cv", { ...input });
}

export interface LetterFingerprintInput {
  content: unknown;
  outputLanguage: string | null;
  profileVersionContent: unknown;
  job: { title: string | null; employer: string | null; structuredFields: unknown };
  createdAt: string;
}

export function letterFingerprint(input: LetterFingerprintInput): string {
  return hash("letter", { ...input });
}
