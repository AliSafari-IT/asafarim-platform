import { extractBoundedText, EXTRACTION_VERSION } from "./extract";
import { resolveScanAdapter, type ScanResult } from "./scan";
import {
  containsEmbeddedZipSignature,
  isAnimatedGif,
  looksLikeEncryptedPdf,
  sniffFormat,
  sniffedFormatMatchesDeclaredMime,
} from "./sniff";
import { AttachmentMismatchError, UnsupportedAttachmentTypeError } from "./errors";

const FORMAT_TO_CANONICAL_IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export interface ProcessedAttachment {
  detectedMimeType: string;
  scan: ScanResult;
  extractionKind: string | null;
  extractionVersion: string | null;
  extractedText: string | null;
  /**
   * Image/PDF dimension and page-count extraction is an explicit, documented
   * deferral for this slice (no image/PDF parsing dependency exists in this
   * monorepo) — always null today. See extract.ts's docstring for the same
   * deferral applied to image/PDF TEXT extraction.
   */
  pageCount: null;
  widthPx: null;
  heightPx: null;
}

/**
 * The extraction/scan "worker boundary" the M13 doc calls for — a pure
 * function over already-verified bytes, deliberately synchronous and
 * in-process rather than a separate queue/worker for this slice: every step
 * here (magic-byte sniff, UTF-8 decode, the no-op scan adapter) is fast and
 * has no slow external dependency. A future real scanner (network call to an
 * AV service) or OCR/PDF-text extraction can be swapped in behind
 * `resolveScanAdapter`/`extractBoundedText` without this function's callers
 * (lib/repositories/attachments.ts#commitAttachmentContent) changing.
 *
 * Throws (never persists/accepts the upload) for anything that fails the
 * M13 "Attachment processing" contract before scanning even begins:
 * unrecognized format, declared/actual MIME mismatch, embedded-archive
 * polyglot, encrypted PDF, or animated GIF. A scan `verdict: "flagged"` is
 * NOT thrown here — that is a legitimate terminal `quarantined` status the
 * caller persists, not a rejected commit.
 */
export async function processAttachmentContent(bytes: Buffer, declaredMimeType: string): Promise<ProcessedAttachment> {
  const format = sniffFormat(bytes);
  if (!format) {
    throw new UnsupportedAttachmentTypeError(declaredMimeType);
  }
  if (!sniffedFormatMatchesDeclaredMime(format, declaredMimeType)) {
    throw new AttachmentMismatchError(
      `Declared type "${declaredMimeType}" does not match the file's actual content.`,
    );
  }
  if (containsEmbeddedZipSignature(bytes) && format !== "text") {
    throw new AttachmentMismatchError("File contains embedded archive data and cannot be accepted.");
  }
  if (format === "pdf" && looksLikeEncryptedPdf(bytes)) {
    throw new UnsupportedAttachmentTypeError("application/pdf (encrypted)");
  }
  if (format === "gif" && isAnimatedGif(bytes)) {
    throw new UnsupportedAttachmentTypeError("image/gif (animated)");
  }

  const detectedMimeType = format === "text" ? declaredMimeType : FORMAT_TO_CANONICAL_IMAGE_MIME[format];

  const scanAdapter = resolveScanAdapter();
  const scan = await scanAdapter.scan(bytes, detectedMimeType);

  const extraction = extractBoundedText(bytes, detectedMimeType);

  return {
    detectedMimeType,
    scan,
    extractionKind: extraction ? extraction.kind : null,
    extractionVersion: extraction ? EXTRACTION_VERSION : null,
    extractedText: extraction ? extraction.text : null,
    pageCount: null,
    widthPx: null,
    heightPx: null,
  };
}
