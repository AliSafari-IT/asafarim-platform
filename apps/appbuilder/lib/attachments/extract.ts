import { ATTACHMENT_LIMITS } from "./limits";

export const EXTRACTION_VERSION = "m13-slice-b-v1";

export interface ExtractionResult {
  kind: "plain_text";
  text: string;
  truncated: boolean;
}

/**
 * Bounded text extraction for text/markdown/json/csv (`text/plain`,
 * `text/markdown`, `application/json`, `text/csv`) — a plain UTF-8 decode
 * truncated to `MAX_EXTRACTED_TEXT_CHARS_PER_FILE`. Image and PDF text
 * extraction are an explicit, documented deferral for this slice (no
 * OCR/PDF-parsing dependency exists in this monorepo yet — see
 * lib/generated-data/files.ts's malware-scanning docstring for the same
 * kind of honest-deferral convention): those attachments still reach
 * `ready` with `extractionKind: null`, never a fabricated/empty string
 * pretending extraction happened.
 *
 * Extracted text is always later treated as untrusted prompt data by
 * whatever eventually reads it (M13 slice D) — this function only bounds
 * and decodes it, it never sanitizes for "safety" (there is nothing unsafe
 * about the text sitting in a database column).
 */
export function extractBoundedText(bytes: Buffer, mimeType: string): ExtractionResult | null {
  if (!["text/plain", "text/markdown", "application/json", "text/csv"].includes(mimeType)) {
    return null;
  }
  const full = bytes.toString("utf8");
  const truncated = full.length > ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS_PER_FILE;
  const text = truncated ? full.slice(0, ATTACHMENT_LIMITS.MAX_EXTRACTED_TEXT_CHARS_PER_FILE) : full;
  return { kind: "plain_text", text, truncated };
}
