/**
 * Timeline attachments: what is accepted and how it is recognised
 * (application-timeline.md). Client-safe: the forms use the same limits.
 *
 * The type comes from the bytes, never from the browser's Content-Type or
 * the file name (the same rule as candidate documents,
 * lib/documents/fileType.ts). Three kinds: a screenshot (PNG, JPEG, WebP),
 * a PDF, or a saved email (.eml, RFC 5322 text). Anything else is refused.
 */

/** At most this many files on one entry, like the five Tailor job files. */
export const MAX_ATTACHMENTS_PER_EVENT = 5;
/** Per file. A screenshot or a confirmation PDF is far smaller. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** One request's files together. */
export const MAX_ATTACHMENTS_TOTAL_BYTES = 20 * 1024 * 1024;

export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.eml,image/png,image/jpeg,image/webp,application/pdf,message/rfc822";

export type AttachmentKindName = "IMAGE" | "PDF" | "EMAIL";

export type AttachmentSniff =
  | { ok: true; kind: AttachmentKindName; contentType: string; extension: string }
  | { ok: false; reason: "EMPTY_FILE" | "UNSUPPORTED_TYPE" | "FILE_TOO_LARGE" };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** Header names a saved email starts with. At least two distinct ones, one
 *  of them From/Date/Subject/Received, before the first blank line. */
const EMAIL_HEADERS = new Set([
  "from",
  "to",
  "cc",
  "date",
  "subject",
  "received",
  "return-path",
  "message-id",
  "mime-version",
  "content-type",
  "delivered-to",
  "reply-to",
  "x-mailer",
  "dkim-signature",
  "arc-seal",
  "authentication-results",
  "thread-topic",
  "x-ms-exchange-organization-authas",
]);

export function looksLikeEmail(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  // Binary content is not a saved email.
  if (head.includes(0)) return false;
  const text = new TextDecoder("latin1").decode(head);
  const end = text.search(/\r?\n\r?\n/);
  const block = end === -1 ? text : text.slice(0, end);
  const seen = new Set<string>();
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) continue; // folded continuation
    const match = /^([A-Za-z0-9-]{1,76}):/.exec(line);
    if (!match) {
      if (line.startsWith("From ")) continue; // mbox separator
      return false;
    }
    const name = match[1].toLowerCase();
    if (EMAIL_HEADERS.has(name)) seen.add(name);
  }
  return seen.size >= 2 && ["from", "date", "subject", "received"].some((h) => seen.has(h));
}

export function sniffAttachment(bytes: Uint8Array): AttachmentSniff {
  if (bytes.byteLength === 0) return { ok: false, reason: "EMPTY_FILE" };
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return { ok: false, reason: "FILE_TOO_LARGE" };
  if (startsWith(bytes, PNG)) return { ok: true, kind: "IMAGE", contentType: "image/png", extension: "png" };
  if (startsWith(bytes, JPEG)) return { ok: true, kind: "IMAGE", contentType: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
    return { ok: true, kind: "IMAGE", contentType: "image/webp", extension: "webp" };
  }
  if (startsWith(bytes, PDF)) return { ok: true, kind: "PDF", contentType: "application/pdf", extension: "pdf" };
  if (looksLikeEmail(bytes)) return { ok: true, kind: "EMAIL", contentType: "message/rfc822", extension: "eml" };
  return { ok: false, reason: "UNSUPPORTED_TYPE" };
}

export type SelectionProblem = "TOO_MANY_FILES" | "FILE_TOO_LARGE" | "TOTAL_TOO_LARGE" | "EMPTY_FILE";

/** The checks the browser runs before an upload, and the server again. */
export function checkAttachmentSelection(files: readonly { size: number }[], alreadyOnEvent = 0): SelectionProblem | null {
  if (files.length + alreadyOnEvent > MAX_ATTACHMENTS_PER_EVENT) return "TOO_MANY_FILES";
  if (files.some((f) => f.size === 0)) return "EMPTY_FILE";
  if (files.some((f) => f.size > MAX_ATTACHMENT_BYTES)) return "FILE_TOO_LARGE";
  if (files.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENTS_TOTAL_BYTES) return "TOTAL_TOO_LARGE";
  return null;
}

/** A display name: path parts, control characters and quotes removed,
 *  length capped. Never used for storage. */
export function displayFilename(name: string, extension: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>]/g, "")
    .trim()
    .slice(0, 120);
  if (!base) return `attachment.${extension}`;
  return base;
}
