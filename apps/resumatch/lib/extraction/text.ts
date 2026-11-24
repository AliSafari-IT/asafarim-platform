import "server-only";
import type { SupportedContentType } from "../documents/fileType";
import { type ParserKind, runParser } from "./parseWorker";
import { type PositionedItem, reconstructReadingOrder } from "./pdfLayout";

/**
 * Text extraction (JM-019).
 *
 * Local extraction is preferred over any remote service: a CV is the most
 * sensitive thing this platform handles, and the fewer systems its bytes
 * cross, the smaller the disclosure surface. Only if a document has no text
 * layer at all does OCR come into play, and that path is deliberately a
 * seam rather than an implementation — see `ocr.ts`.
 *
 * Every extractor here runs on bytes that have already come back clean
 * from the scanner. `lib/documents/pipeline.ts` is what guarantees that,
 * and nothing in this module should be called without going through it.
 */

export type ExtractionOutcome =
  | { ok: true; text: string; characters: number }
  | { ok: false; reasonCode: "NO_TEXT_LAYER" | "EXTRACTION_ERROR" | "UNSUPPORTED_TYPE" };

/**
 * Below this, a "successful" extraction is almost certainly a scanned page
 * whose only text is a header or a page number. Treated as no text layer so
 * the candidate gets the "this looks like a scan" message rather than a
 * profile built from three words.
 */
export const MIN_USEFUL_CHARACTERS = 120;

/** Guards against a decompression bomb producing a gigabyte of text. */
export const MAX_EXTRACTED_CHARACTERS = 400_000;

/**
 * Wall-clock budget for parsing one document (#528).
 *
 * The byte cap bounds the input and MAX_EXTRACTED_CHARACTERS bounds the
 * output, but neither bounds the parse itself: a small PDF with a
 * pathological structure can keep pdf.js busy far longer than any real CV.
 * A long multi-page CV parses in a few seconds at most, so 20s only fires on
 * genuinely broken input, and it stays below the upload route's 60s
 * `maxDuration`. The bound lives here, not in the route, so it keeps holding
 * once a background worker (which has no route timeout) drives extraction.
 *
 * The parse runs in a worker thread (./parseWorker.ts) that is terminated at
 * the deadline, so even a synchronous step that never yields is stopped.
 */
export const EXTRACTION_TIMEOUT_MS = 20_000;

function finish(raw: string): ExtractionOutcome {
  const text = normalizeWhitespace(raw).slice(0, MAX_EXTRACTED_CHARACTERS);
  if (text.length < MIN_USEFUL_CHARACTERS) return { ok: false, reasonCode: "NO_TEXT_LAYER" };
  return { ok: true, text, characters: text.length };
}

/**
 * PDF and DOCX extraction both produce ragged whitespace — hard-wrapped
 * lines, repeated blank lines, non-breaking spaces from Word. Normalising
 * once here means every downstream heuristic sees the same shape.
 */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    // Word and PDF exports are full of non-breaking and narrow spaces;
    // collapsing them here means every downstream heuristic sees one shape.
    .replace(/[\u00a0\u202f\u2007]/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractWithWorker(
  kind: ParserKind,
  bytes: Uint8Array,
): Promise<ExtractionOutcome> {
  const parsed = await runParser(kind, bytes, { timeoutMs: EXTRACTION_TIMEOUT_MS });
  // Timeouts, memory bombs and parser errors all reach the candidate as the
  // same EXTRACTION_ERROR; the reason is not logged (see parseWorker.ts).
  if (!parsed.ok) return { ok: false, reasonCode: "EXTRACTION_ERROR" };
  if (parsed.kind === "pdf") {
    // The worker returns the runs with their positions rather than the
    // library's flattened string. That string is in drawing order, which for
    // a multi-column CV interleaves the columns. See pdfLayout.ts.
    const pages: { items: PositionedItem[]; width: number }[] = parsed.pages;
    return finish(reconstructReadingOrder(pages));
  }
  return finish(parsed.text);
}

function extractPlainText(bytes: Uint8Array): ExtractionOutcome {
  try {
    return finish(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, reasonCode: "EXTRACTION_ERROR" };
  }
}

/** Identifies which code produced a profile version, for reproducibility.
 *  Defined in ./versions (with the rule for when to bump it). */
export { EXTRACTOR_NAME, EXTRACTOR_VERSION } from "./versions";

export async function extractText(
  bytes: Uint8Array,
  contentType: SupportedContentType,
): Promise<ExtractionOutcome> {
  switch (contentType) {
    case "application/pdf":
      return extractWithWorker("pdf", bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractWithWorker("docx", bytes);
    case "text/plain":
      return extractPlainText(bytes);
    default:
      return { ok: false, reasonCode: "UNSUPPORTED_TYPE" };
  }
}
