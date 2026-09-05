/**
 * The document pipeline as a pure state machine.
 *
 * Kept free of Prisma, storage, and scanner calls so the security-critical
 * question — "can anything reach a parser without a clean scan?" — is
 * answered by a function a test can exhaust, rather than by reading the
 * call sites and hoping.
 */

export type DocumentStatusName =
  | "UPLOADED"
  | "SCANNING"
  | "QUARANTINED"
  | "CLEAN"
  | "EXTRACTING"
  | "EXTRACTED"
  | "FAILED";

/** Retry budget for extraction. Bounded so a malformed document cannot be
 *  retried into a permanent queue occupant. */
export const MAX_EXTRACTION_ATTEMPTS = 3;

const ALLOWED_TRANSITIONS: Record<DocumentStatusName, readonly DocumentStatusName[]> = {
  UPLOADED: ["SCANNING", "QUARANTINED"],
  SCANNING: ["CLEAN", "QUARANTINED"],
  // Terminal without operator action: a quarantined document is never
  // released by the pipeline itself.
  QUARANTINED: [],
  CLEAN: ["EXTRACTING"],
  // Back to EXTRACTING is the retry edge; FAILED is the exhausted-budget
  // edge. Neither can reach CLEAN again, so a document cannot be re-queued
  // in a way that skips its scan history.
  EXTRACTING: ["EXTRACTED", "EXTRACTING", "FAILED"],
  EXTRACTED: [],
  FAILED: [],
};

export function canTransition(from: DocumentStatusName, to: DocumentStatusName): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Whether a quarantined document may be sent back through the scanner
 * (issue #203's "existing quarantined documents have a safe, authorized
 * retry/rescan path").
 *
 * Deliberately a separate function rather than an edge added to
 * `ALLOWED_TRANSITIONS["QUARANTINED"]`: that table's own doc comment states
 * a real security property — QUARANTINED is terminal, never released by
 * the pipeline itself — and a rescan is a candidate-initiated action, not
 * something the pipeline does on its own. Narrowed to
 * `SCANNER_UNAVAILABLE` specifically: a document quarantined because the
 * scanner was down deserves another attempt once it's back; a document
 * quarantined because ClamAV actually flagged it must never be offered a
 * "try again" button that implies the verdict might change.
 */
export function canRetryScan(status: DocumentStatusName, reasonCode: string | null): boolean {
  return status === "QUARANTINED" && reasonCode === "SCANNER_UNAVAILABLE";
}

/**
 * The one question everything else depends on. Extraction is permitted from
 * exactly two states, and neither is reachable without a clean scan.
 */
export function mayExtract(status: DocumentStatusName): boolean {
  return status === "CLEAN" || status === "EXTRACTING";
}

/** Whether a failed extraction has retries left. */
export function shouldRetryExtraction(attempts: number): boolean {
  return attempts < MAX_EXTRACTION_ATTEMPTS;
}

/**
 * Where a document goes after an extraction attempt fails. Retries stay in
 * EXTRACTING (the attempt counter is what advances); an exhausted budget is
 * terminal.
 */
export function nextStatusAfterExtractionFailure(attempts: number): DocumentStatusName {
  return shouldRetryExtraction(attempts) ? "EXTRACTING" : "FAILED";
}

/**
 * User-facing explanation for a stalled document. Deliberately built from
 * the reason *code*, never from a scanner or parser message — those can
 * embed file content, and this string is rendered to the user and written
 * to the audit trail.
 */
export function explainReasonCode(code: string | null): string {
  switch (code) {
    case "MALWARE_DETECTED":
      return "This file was flagged as unsafe and has been quarantined. It was not opened or read.";
    case "SCANNER_UNAVAILABLE":
      return "The malware scanner could not check this file, so it was quarantined rather than processed. Try again later.";
    case "UNSUPPORTED_TYPE":
      return "Only PDF, Word (.docx), and plain text files are accepted.";
    case "DECLARED_TYPE_MISMATCH":
      return "This file's contents do not match its file type.";
    case "FILE_TOO_LARGE":
      return "This file is larger than the 10 MB limit.";
    case "EMPTY_FILE":
      return "This file is empty.";
    case "ENCRYPTED_DOCUMENT":
      return "This document is password-protected. Remove the password and upload it again.";
    case "NO_TEXT_LAYER":
      // Covers both causes without asserting either: a scanned image with no
      // text layer, and a file that is simply too short to build a profile
      // from. Telling someone their plain-text file "may be a scan" is the
      // kind of confidently wrong message that makes people distrust the
      // rest of the screen.
      return "Not enough text could be read from this document. If it is a scan or an image, a text-based PDF or Word file works better. You can also fill in your profile by hand below.";
    case "LAYOUT_UNRELIABLE":
      return "Your contact details and languages were read, but this document's layout (columns, or a heavily designed template) could not be followed reliably. Rather than fill your profile with text from the wrong part of the page, the remaining fields were left for you. A single-column CV usually reads correctly.";
    case "EXTRACTION_ERROR":
      return "This document could not be read. You can still build your profile by hand.";
    default:
      return "This document could not be processed.";
  }
}
