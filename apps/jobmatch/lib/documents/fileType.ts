/**
 * Content-type detection from the bytes themselves (JM-017).
 *
 * The browser-declared `Content-Type` and the filename extension are both
 * attacker-controlled. Trusting either is how a parser gets handed
 * something it was never meant to open. So the declared type is used for
 * exactly one thing — detecting a *mismatch*, which is itself a signal —
 * and everything downstream uses the sniffed type.
 *
 * The accepted set is deliberately narrow. Every additional format is
 * another parser's attack surface, and a CV that is not a PDF, a Word
 * document, or plain text is rare enough that asking the candidate to
 * convert it is the better trade.
 */

export const SUPPORTED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

/** 10 MB. Comfortably above a scanned multi-page CV, far below a payload. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type SniffResult =
  | { ok: true; contentType: SupportedContentType; extension: string }
  | { ok: false; reason: "UNSUPPORTED_TYPE" | "EMPTY_FILE" | "ENCRYPTED_DOCUMENT" };

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** `%PDF-` */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** `PK\x03\x04` — the ZIP container every .docx is. */
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

/**
 * A DOCX is a ZIP, and so is a JAR, an XLSX, and an ODT. Requiring the
 * OOXML word/document.xml part means a renamed archive is rejected rather
 * than handed to a Word parser.
 *
 * This is a byte search rather than a full ZIP parse on purpose: parsing
 * the central directory of an untrusted archive before it has been scanned
 * is exactly the kind of pre-scan processing JM-018 forbids.
 */
function looksLikeDocx(bytes: Uint8Array): boolean {
  const needle = new TextEncoder().encode("word/document.xml");
  const limit = Math.min(bytes.length, 64 * 1024);
  outer: for (let i = 0; i + needle.length <= limit; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * An encrypted PDF cannot be extracted from, and a password prompt in a
 * background worker is a hang, not a feature. Detected here so the
 * candidate gets a clear "remove the password" message instead of a failed
 * extraction twenty minutes later.
 */
function looksEncrypted(bytes: Uint8Array): boolean {
  const needle = new TextEncoder().encode("/Encrypt");
  // The trailer is at the end of a PDF, so search the tail.
  const from = Math.max(0, bytes.length - 4096);
  outer: for (let i = from; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Plain text must actually be text — no NUL bytes, valid UTF-8. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

export function sniffContentType(bytes: Uint8Array): SniffResult {
  if (bytes.length === 0) return { ok: false, reason: "EMPTY_FILE" };

  if (startsWith(bytes, PDF_SIGNATURE)) {
    if (looksEncrypted(bytes)) return { ok: false, reason: "ENCRYPTED_DOCUMENT" };
    return { ok: true, contentType: "application/pdf", extension: "pdf" };
  }

  if (startsWith(bytes, ZIP_SIGNATURE)) {
    // Deliberately terminal: a ZIP that is not a DOCX must be rejected
    // outright, never fall through to the text check below. Its header
    // bytes are valid UTF-8 with no NULs, so a JAR or an XLSX would
    // otherwise be classified as text/plain and stored as a "CV".
    if (!looksLikeDocx(bytes)) return { ok: false, reason: "UNSUPPORTED_TYPE" };
    return {
      ok: true,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    };
  }

  if (looksLikeText(bytes)) return { ok: true, contentType: "text/plain", extension: "txt" };

  return { ok: false, reason: "UNSUPPORTED_TYPE" };
}

export type ValidationResult =
  | { ok: true; contentType: SupportedContentType; extension: string; declaredMismatch: boolean }
  | { ok: false; reason: "UNSUPPORTED_TYPE" | "EMPTY_FILE" | "ENCRYPTED_DOCUMENT" | "FILE_TOO_LARGE" };

/**
 * Full upload validation. `declaredContentType` is only ever used to report
 * a mismatch; the sniffed type is what the caller must act on.
 */
export function validateUpload(
  bytes: Uint8Array,
  declaredContentType: string | null,
): ValidationResult {
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: "FILE_TOO_LARGE" };

  const sniffed = sniffContentType(bytes);
  if (!sniffed.ok) return sniffed;

  const declared = (declaredContentType ?? "").split(";")[0].trim().toLowerCase();
  return {
    ok: true,
    contentType: sniffed.contentType,
    extension: sniffed.extension,
    declaredMismatch: declared.length > 0 && declared !== sniffed.contentType,
  };
}

/**
 * A display-safe version of the user's filename.
 *
 * The real defence is that this value never builds a storage key or a
 * filesystem path — keys are `<workspaceId>/<cuid>.<ext>` and nothing else.
 * This just keeps path separators, control characters, and absurd lengths
 * out of the UI and the audit trail.
 */
export function safeDisplayFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "document";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned.length > 0 ? cleaned : "document").slice(0, 200);
}
