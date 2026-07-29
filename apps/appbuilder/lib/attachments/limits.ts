/**
 * M13 slice B — the server-owned attachment catalogue (docs/appbuilder-
 * m13-multimodal-contextual-assistant.md, "Composer > Initial server-owned
 * limits"). The client keeps no divergent allowlist; these are the only
 * numbers that matter. Per-message/attachment-count enforcement
 * (`MAX_ATTACHMENTS_PER_MESSAGE`) lives here too; slice C wired it to its
 * real call site (claiming attachments as a message is sent) and serves the
 * whole catalogue to the composer through `attachmentPolicy()` below.
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

/** The wire shape of the catalogue, as served to the composer. */
export interface AttachmentPolicy {
  /** Every accepted MIME type mapped to its category and per-file byte ceiling. */
  types: { mimeType: string; category: AttachmentCategory; maxBytes: number }[];
  maxAttachmentsPerMessage: number;
  maxFilenameLength: number;
}

/**
 * The catalogue the client is handed at conversation load. M13 requires
 * "the server returns this catalogue; the client keeps no divergent
 * allowlist" — so the composer's accept filter, size checks, and count cap
 * are all derived from THIS, and raising a limit here raises it everywhere
 * without a matching client edit. Client-side validation remains a
 * courtesy that fails fast with a good message; every one of these limits
 * is re-enforced server-side at init/commit/claim regardless.
 */
export function attachmentPolicy(): AttachmentPolicy {
  return {
    types: ALLOWED_ATTACHMENT_MIME_TYPES.map((mimeType) => ({
      mimeType,
      category: ATTACHMENT_MIME_CATEGORY[mimeType],
      maxBytes: ATTACHMENT_MAX_BYTES[ATTACHMENT_MIME_CATEGORY[mimeType]],
    })),
    maxAttachmentsPerMessage: ATTACHMENT_LIMITS.MAX_ATTACHMENTS_PER_MESSAGE,
    maxFilenameLength: ATTACHMENT_LIMITS.MAX_ORIGINAL_FILENAME_LENGTH,
  };
}

export function maxBytesForMimeType(mimeType: string): number | null {
  const category = categoryForMimeType(mimeType);
  return category ? ATTACHMENT_MAX_BYTES[category] : null;
}
