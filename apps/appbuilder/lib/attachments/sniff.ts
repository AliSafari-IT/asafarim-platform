/**
 * Byte-level MIME sniffing — "detect MIME from bytes; never trust
 * extension/browser MIME" (docs/appbuilder-m13-multimodal-contextual-
 * assistant.md, "Attachment processing"). No third-party sniffing library
 * exists in this monorepo yet, so this implements exactly the signatures
 * the M13 allowlist needs (packages/appbuilder-ai has no equivalent —
 * these are file-format magic bytes, unrelated to model schemas) rather
 * than pulling in a general-purpose dependency for six formats.
 *
 * Text-like formats (text/markdown/json/csv) have no reliable magic bytes
 * of their own — `looksLikeText` instead asserts the bytes are NOT one of
 * the binary signatures below and decode as valid, printable-ish UTF-8, so
 * a mislabeled binary upload (PNG bytes declared as "text/csv") is still
 * caught.
 */
export type SniffedFormat = "png" | "jpeg" | "webp" | "gif" | "pdf" | "text";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87_SIGNATURE = Buffer.from("GIF87a", "ascii");
const GIF89_SIGNATURE = Buffer.from("GIF89a", "ascii");
const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");
const ZIP_LOCAL_FILE_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_ARCHIVE_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function startsWith(bytes: Buffer, signature: Buffer): boolean {
  return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

/** Best-effort "does this look like readable text" check — rejects null bytes and invalid UTF-8, the two cheapest, highest-signal binary tells. */
function looksLikeText(bytes: Buffer): boolean {
  if (bytes.includes(0x00)) return false;
  try {
    const decoded = bytes.toString("utf8");
    // Re-encoding and comparing byte length catches lossy/invalid UTF-8
    // sequences that Node's decoder otherwise silently replaces.
    return Buffer.byteLength(decoded, "utf8") === bytes.length;
  } catch {
    return false;
  }
}

/** Detects one of the M13-allowlisted binary formats from magic bytes, or `"text"` when the bytes contain none of them and decode as valid UTF-8. Returns null when neither — an unrecognized/unsupported format. */
export function sniffFormat(bytes: Buffer): SniffedFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "jpeg";
  if (startsWith(bytes, GIF87_SIGNATURE) || startsWith(bytes, GIF89_SIGNATURE)) return "gif";
  if (isWebp(bytes)) return "webp";
  if (startsWith(bytes, PDF_SIGNATURE)) return "pdf";
  if (looksLikeText(bytes)) return "text";
  return null;
}

const FORMAT_TO_CANONICAL_MIME: Record<SniffedFormat, string | null> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  // Text has several valid declared MIME types (plain/markdown/json/csv) —
  // the sniffer can't distinguish those from bytes alone, so the declared
  // type is trusted for WHICH text type, only rejected if it isn't text at
  // all.
  text: null,
};

/** Whether the sniffed format is consistent with what the client declared at init. */
export function sniffedFormatMatchesDeclaredMime(format: SniffedFormat, declaredMimeType: string): boolean {
  if (format === "text") {
    return ["text/plain", "text/markdown", "application/json", "text/csv"].includes(declaredMimeType);
  }
  return FORMAT_TO_CANONICAL_MIME[format] === declaredMimeType;
}

/**
 * A ZIP local-file-header signature appearing anywhere in bytes that sniff
 * as an image/PDF is the classic "polyglot" shape (a file that is
 * simultaneously a valid image/PDF AND a valid archive, e.g. a "GIFAR") —
 * reject it outright rather than trying to determine which interpretation
 * is "real".
 */
export function containsEmbeddedZipSignature(bytes: Buffer): boolean {
  return bytes.includes(ZIP_LOCAL_FILE_SIGNATURE) || bytes.includes(ZIP_EMPTY_ARCHIVE_SIGNATURE);
}

/**
 * Bounded heuristic for "does this PDF declare itself encrypted" — a real
 * `/Encrypt` entry lives in the trailer dictionary, which for a
 * well-formed, non-linearized PDF is near the end of the file. This is
 * deliberately NOT a full PDF parser (no such dependency exists in this
 * monorepo); it scans only the last 4KB, which is sufficient for the
 * trailer in the overwhelming majority of real-world PDFs and never reads
 * the whole file into a second buffer.
 */
export function looksLikeEncryptedPdf(bytes: Buffer): boolean {
  const tailStart = Math.max(0, bytes.length - 4096);
  const tail = bytes.subarray(tailStart).toString("latin1");
  return /\/Encrypt\b/.test(tail);
}

/**
 * A minimal, bounded GIF frame count — counts image-descriptor blocks
 * (0x2C) after the logical screen descriptor, capped at `limit + 1` scans
 * so a maliciously crafted GIF can't force an unbounded scan. Not a full
 * GIF decoder; false positives (counting a stray 0x2C byte inside
 * sub-block data as a frame) only make this MORE conservative (more likely
 * to reject as "animated"), never less safe.
 */
export function countGifFrames(bytes: Buffer, limit = 2): number {
  let frames = 0;
  // Skip the 6-byte GIF signature + logical screen descriptor overhead
  // before scanning for image-descriptor introducers.
  for (let i = 13; i < bytes.length && frames <= limit; i += 1) {
    if (bytes[i] === 0x2c) frames += 1;
  }
  return frames;
}

export function isAnimatedGif(bytes: Buffer): boolean {
  return countGifFrames(bytes, 1) > 1;
}
