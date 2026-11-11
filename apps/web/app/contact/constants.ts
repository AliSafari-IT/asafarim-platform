// Shared contact-inbox limits + file-type rules. Safe to import from both
// client and server (no server-only dependencies).

export const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB total across attachments
export const MAX_FILES = 20;
// Notification emails only carry attachments up to this total (staying under the
// common 25 MB provider limit); everything is always kept in the inbox.
export const EMAIL_ATTACH_CAP_BYTES = 20 * 1024 * 1024;

export const MAX_HTML_LENGTH = 200_000;

/** Allowed upload extensions: docs, spreadsheets, markdown/text, and images. */
// Legacy Office formats (doc, xls, ppt, rtf: macros and OLE exploits) and svg (active
// content) are not accepted; the content of every accepted type is verified on the server.
export const ALLOWED_EXTENSIONS = [
  "pdf",
  "docx",
  "md",
  "markdown",
  "txt",
  "xlsx",
  "csv",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
] as const;

/** `accept` attribute for the file input. */
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
};

export function extOf(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName);
  return m ? m[1]!.toLowerCase() : "";
}

export function isAllowedFile(fileName: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extOf(fileName));
}

/** Best-effort content type from a filename, falling back to the browser value. */
export function contentTypeFor(fileName: string, browserType?: string): string {
  return (
    MIME_BY_EXT[extOf(fileName)] ?? (browserType || "application/octet-stream")
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** A coarse category used to pick an icon/label for an attachment. */
export function fileKind(
  fileName: string
): "image" | "pdf" | "doc" | "sheet" | "slides" | "text" | "file" {
  const ext = extOf(fileName);
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext))
    return "image";
  if (ext === "pdf") return "pdf";
  if (["docx"].includes(ext)) return "doc";
  if (["xlsx", "csv"].includes(ext)) return "sheet";
  if (["pptx"].includes(ext)) return "slides";
  if (["md", "markdown", "txt"].includes(ext)) return "text";
  return "file";
}
