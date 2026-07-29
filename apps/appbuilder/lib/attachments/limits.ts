/**
 * M13 slice B — the server-owned attachment catalogue (docs/appbuilder-
 * m13-multimodal-contextual-assistant.md, "Composer > Initial server-owned
 * limits"). The client keeps no divergent allowlist; these are the only
 * numbers that matter. Per-message/attachment-count enforcement
 * (`MAX_ATTACHMENTS_PER_MESSAGE`) lives here too even though nothing calls
 * it yet in this slice (no message currently claims attachments — that
 * wiring is slice C) so the limit is defined once, ready for that call site.
 */
export type AttachmentCategory = "image" | "text" | "pdf";

export const ATTACHMENT_MIME_CATEGORY: Record<string, AttachmentCategory> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "text/plain": "text",
  "text/markdown": "text",
  "application/json": "text",
  "text/csv": "text",
  "application/pdf": "pdf",
};

export const ALLOWED_ATTACHMENT_MIME_TYPES: readonly string[] = Object.keys(ATTACHMENT_MIME_CATEGORY);

const BYTES_PER_MB = 1024 * 1024;

/** Per-category maximum declared/actual size, in bytes. */
export const ATTACHMENT_MAX_BYTES: Record<AttachmentCategory, number> = {
  image: 10 * BYTES_PER_MB,
  text: 2 * BYTES_PER_MB,
  pdf: 20 * BYTES_PER_MB,
};

export const ATTACHMENT_LIMITS = {
  MAX_ATTACHMENTS_PER_MESSAGE: 8,
  MAX_EXTRACTED_TEXT_CHARS_PER_FILE: 50_000,
  MAX_EXTRACTED_TEXT_CHARS_PER_MODEL_CALL: 100_000,
  MAX_IMAGE_DIMENSION_PX: 12_000,
  MAX_ORIGINAL_FILENAME_LENGTH: 255,
} as const;

export function categoryForMimeType(mimeType: string): AttachmentCategory | null {
  return ATTACHMENT_MIME_CATEGORY[mimeType] ?? null;
}

export function maxBytesForMimeType(mimeType: string): number | null {
  const category = categoryForMimeType(mimeType);
  return category ? ATTACHMENT_MAX_BYTES[category] : null;
}
