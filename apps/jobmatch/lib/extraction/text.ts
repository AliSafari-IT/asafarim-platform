import "server-only";
import type { SupportedContentType } from "../documents/fileType";

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

async function extractPdf(bytes: Uint8Array): Promise<ExtractionOutcome> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return finish(Array.isArray(text) ? text.join("\n") : text);
  } catch {
    // The parser's own error is deliberately discarded rather than logged:
    // pdf.js messages routinely quote document content.
    return { ok: false, reasonCode: "EXTRACTION_ERROR" };
  }
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractionOutcome> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    });
    return finish(result.value);
  } catch {
    return { ok: false, reasonCode: "EXTRACTION_ERROR" };
  }
}

function extractPlainText(bytes: Uint8Array): ExtractionOutcome {
  try {
    return finish(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, reasonCode: "EXTRACTION_ERROR" };
  }
}

/** Identifies which code produced a profile version, for reproducibility. */
export const EXTRACTOR_NAME = "jobmatch-local-text";
export const EXTRACTOR_VERSION = "1.0.0";

export async function extractText(
  bytes: Uint8Array,
  contentType: SupportedContentType,
): Promise<ExtractionOutcome> {
  switch (contentType) {
    case "application/pdf":
      return extractPdf(bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(bytes);
    case "text/plain":
      return extractPlainText(bytes);
    default:
      return { ok: false, reasonCode: "UNSUPPORTED_TYPE" };
  }
}
