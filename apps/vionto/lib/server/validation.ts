import { z } from "zod";
import { VISUAL_STYLE_VALUES } from "../visual-styles";
import { PRIVACY_LEVELS } from "../album-constants";
import { VIDEO_TEMPLATE_IDS } from "../video-templates";

/**
 * Vionto file constraints — kept in sync with the project plan §6.2.1.
 * All entry points (presign, upload, zip import) share the same rules.
 */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB per image
export const MAX_ZIP_BYTES = 500 * 1024 * 1024; // 500 MB per zip
export const MAX_BATCH_SIZE = 200; // max images per project
export const MIN_FILE_BYTES = 1;

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
] as const;

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const AUDIO_MIME_TYPES = [
  "audio/mp4", // .m4a
  "audio/mpeg", // .mp3
  "audio/wav",
  "audio/webm",
  "audio/ogg",
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
  ...AUDIO_MIME_TYPES,
  "application/zip",
  "application/x-zip-compressed",
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

/** Reject path traversal and weird unicode early. */
const safeFilename = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\\/:*?"<>|\u0000-\u001f]+$/, "filename contains invalid characters");

const storageCategorySchema = z.enum(["originals", "thumbnails", "audio", "renders", "exports", "sessions"]).optional();

export const presignRequestSchema = z.object({
  filename: safeFilename,
  contentType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().min(MIN_FILE_BYTES).max(MAX_IMAGE_BYTES),
  sessionId: z.string().min(1).max(128).optional(),
  category: storageCategorySchema,
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const uploadCompleteSchema = z.object({
  key: z.string().min(1).max(512),
  sessionId: z.string().min(1).max(128),
  metadata: z.object({
    filename: safeFilename,
    contentType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
    sizeBytes: z.number().int().min(MIN_FILE_BYTES).max(MAX_IMAGE_BYTES),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    exif: z.record(z.unknown()).optional(),
  }),
});
export type UploadCompletePayload = z.infer<typeof uploadCompleteSchema>;

export const zipImportSchema = z.object({
  key: z.string().min(1).max(512),
  sessionId: z.string().min(1).max(128),
  expectedCount: z.number().int().min(1).max(MAX_BATCH_SIZE).optional(),
});
export type ZipImportPayload = z.infer<typeof zipImportSchema>;

export const promoteSessionSchema = z.object({
  sessionId: z.string().min(1).max(128),
  orderedKeys: z.array(z.string().min(1).max(512)).max(MAX_BATCH_SIZE).optional(),
  clearSession: z.boolean().optional(),
});
export type PromoteSessionPayload = z.infer<typeof promoteSessionSchema>;

/**
 * Flatten a ZodError into a single human-readable string.
 */
export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue: z.ZodIssue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

// ─── Project schemas ──────────────────────────────────────────────────

/** Target video duration in seconds — must be 10–90 and a multiple of 5. */
const targetDurationSecondsSchema = z
  .number()
  .int()
  .min(15)
  .max(90)
  .refine((v) => v % 5 === 0, { message: "targetDurationSeconds must be a multiple of 5" })
  .default(20);

export const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  mode: z.enum(["story", "slideshow", "documentary"]).default("story"),
  storyMode: z.string().optional(),
  emotionalTone: z.string().optional(),
  visualStyle: z.enum(VISUAL_STYLE_VALUES).default("clean_modern_slideshow"),
  musicOption: z.enum(["calm_piano", "cinematic_strings", "travel_upbeat", "family_warm_acoustic", "no_music", "upload_own"]).default("no_music"),
  musicTrackId: z.string().nullable().optional(),
  musicMetadata: z.any().nullable().optional(),
  locale: z.string().min(2).max(10).default("en"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3"]).default("16:9"),
  resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  targetDurationSeconds: targetDurationSecondsSchema.optional(),
  templateId: z.enum(VIDEO_TEMPLATE_IDS).nullable().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// ─── Story structure & caption overlay schemas (#102) ────────────────

/** Chapter entry for a video's narrative structure. */
const storyChapterSchema = z.object({
  title: z.string().max(120).default(""),
  description: z.string().max(500).default(""),
});

/** Story structure defines the narrative skeleton of a generated video. */
export const storyStructureSchema = z.object({
  openingTitle: z.string().max(200).default(""),
  introNarration: z.string().max(1000).default(""),
  chapters: z.array(storyChapterSchema).max(10).default([]),
  climaxDescription: z.string().max(500).default(""),
  closingMessage: z.string().max(500).default(""),
  dedicationText: z.string().max(300).default(""),
});

export type StoryStructure = z.infer<typeof storyStructureSchema>;

const CAPTION_PLACEMENTS = ["top", "bottom", "lower_third", "corner"] as const;
const CAPTION_STYLE_PRESETS = ["minimal", "memory", "social", "documentary"] as const;

/** Caption overlay settings control which metadata captions appear in the rendered video. */
export const captionOverlaySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  showSceneCaptions: z.boolean().default(true),
  showDateCaptions: z.boolean().default(true),
  showLocationCaptions: z.boolean().default(true),
  showPeopleLabels: z.boolean().default(false),
  placement: z.enum(CAPTION_PLACEMENTS).default("lower_third"),
  stylePreset: z.enum(CAPTION_STYLE_PRESETS).default("minimal"),
});

export type CaptionOverlaySettings = z.infer<typeof captionOverlaySettingsSchema>;

// ─── Video version schemas ──────────────────────────────────────────

const musicOptionValues = ["calm_piano", "cinematic_strings", "travel_upbeat", "family_warm_acoustic", "no_music", "upload_own"] as const;

export const createVideoVersionSchema = z.object({
  name: z.string().min(1).max(120).default("Version 1"),
  albumId: z.string().cuid().nullable().optional(),
  mode: z.enum(["story", "slideshow", "documentary"]).default("story"),
  storyMode: z.string().optional(),
  emotionalTone: z.string().optional(),
  visualStyle: z.enum(VISUAL_STYLE_VALUES).default("clean_modern_slideshow"),
  subtitleSettings: z.any().nullable().optional(),
  musicOption: z.enum(musicOptionValues).default("no_music"),
  musicTrackId: z.string().nullable().optional(),
  musicUploadKey: z.string().nullable().optional(),
  musicMetadata: z.any().nullable().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3"]).default("16:9"),
  resolution: z.enum(["720p", "1080p", "4k"]).nullable().optional(),
  targetDurationSeconds: targetDurationSecondsSchema.optional(),
  storyStructure: storyStructureSchema.nullable().optional(),
  captionOverlaySettings: captionOverlaySettingsSchema.nullable().optional(),
  templateId: z.enum(VIDEO_TEMPLATE_IDS).nullable().optional(),
  templateSettings: z.any().nullable().optional(),
  /** Clone settings from an existing version instead of using defaults. */
  cloneFromVersionId: z.string().cuid().optional(),
});

export const updateVideoVersionSchema = createVideoVersionSchema.omit({ cloneFromVersionId: true }).partial();

export type CreateVideoVersionInput = z.infer<typeof createVideoVersionSchema>;
export type UpdateVideoVersionInput = z.infer<typeof updateVideoVersionSchema>;

// ─── Pagination schema ────────────────────────────────────────────────

// ─── Project sharing schemas ──────────────────────────────────

export const addShareSchema = z.object({
  email: z.string().email("Must be a valid email address").toLowerCase(),
  permission: z.enum(["viewer", "editor"]).default("viewer"),
});

export const removeShareSchema = z.object({
  shareId: z.string().min(1),
});

export type AddShareInput = z.infer<typeof addShareSchema>;
export type RemoveShareInput = z.infer<typeof removeShareSchema>;

// ─── Pagination schema ────────────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// ─── Album schemas ────────────────────────────────────────────────────────────

/** Max byte-size allowed for album-item metadata JSON (serialised). */
export const MAX_ALBUM_ITEM_METADATA_BYTES = 8 * 1024; // 8 KB

export const createAlbumSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    /** If true, seed the new album with every image currently in the base album. */
    fromBase: z.boolean().default(false),
    /** Seed the new album with a specific subset of asset IDs. */
    assetIds: z.array(z.string().cuid()).max(200).optional(),
    coverAssetId: z.string().cuid().optional(),
    metadata: z.any().optional(),
    lifecycleStage: z.enum(["draft", "photos_uploaded", "story_generated", "audio_ready", "video_rendered", "published_exported"]).optional(),
    collections: z.array(z.string().min(1).max(80)).max(12).default([]),
    isFavorite: z.boolean().default(false),
    dateFrom: z.coerce.date().nullable().optional(),
    dateTo: z.coerce.date().nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    people: z.array(z.string().max(100)).max(50).default([]),
    occasion: z.string().max(100).nullable().optional(),
    mood: z.string().max(100).nullable().optional(),
    privacyLevel: z.enum(PRIVACY_LEVELS).default("private"),
  })
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo) return data.dateFrom <= data.dateTo;
      return true;
    },
    { message: "Start date must be before or equal to end date", path: ["dateTo"] },
  );

export const updateAlbumSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    coverAssetId: z.string().cuid().nullable().optional(),
    metadata: z.any().optional(),
    lifecycleStage: z.enum(["draft", "photos_uploaded", "story_generated", "audio_ready", "video_rendered", "published_exported"]).optional(),
    collections: z.array(z.string().min(1).max(80)).max(12).optional(),
    isFavorite: z.boolean().optional(),
    dateFrom: z.coerce.date().nullable().optional(),
    dateTo: z.coerce.date().nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    people: z.array(z.string().max(100)).max(50).optional(),
    occasion: z.string().max(100).nullable().optional(),
    mood: z.string().max(100).nullable().optional(),
    privacyLevel: z.enum(PRIVACY_LEVELS).optional(),
  })
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo) return data.dateFrom <= data.dateTo;
      return true;
    },
    { message: "Start date must be before or equal to end date", path: ["dateTo"] },
  );

/** Item metadata must be a plain object and serialise to ≤ MAX_ALBUM_ITEM_METADATA_BYTES. */
const albumItemMetadataSchema = z
  .record(z.unknown())
  .nullable()
  .optional()
  .superRefine((val, ctx) => {
    if (val == null) return;
    const json = JSON.stringify(val);
    if (json.length > MAX_ALBUM_ITEM_METADATA_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metadata must not exceed ${MAX_ALBUM_ITEM_METADATA_BYTES} bytes when serialised as JSON`,
      });
    }
  });

export const addAlbumItemSchema = z.object({
  assetId: z.string().cuid(),
  orderIndex: z.number().int().min(0).optional(),
  metadata: albumItemMetadataSchema,
  hidden: z.boolean().optional(),
  favorite: z.boolean().optional(),
});

export const addAlbumItemsBulkSchema = z.object({
  assetIds: z.array(z.string().cuid()).min(1).max(200),
});

export const updateAlbumItemSchema = z.object({
  orderIndex: z.number().int().min(0).optional(),
  metadata: albumItemMetadataSchema,
  hidden: z.boolean().optional(),
  favorite: z.boolean().optional(),
});

export const reorderAlbumItemsSchema = z.object({
  /** Ordered array of album-item IDs. All IDs must belong to this album. */
  orderedItemIds: z.array(z.string().cuid()).min(1).max(200),
});

export const sortAlbumItemsSchema = z.object({
  /** Sort mode: date_asc/date_desc use EXIF timestamp, location clusters by GPS. */
  mode: z.enum(["date_asc", "date_desc", "location"]),
});

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
export type AddAlbumItemInput = z.infer<typeof addAlbumItemSchema>;
export type AddAlbumItemsBulkInput = z.infer<typeof addAlbumItemsBulkSchema>;
export type UpdateAlbumItemInput = z.infer<typeof updateAlbumItemSchema>;
export type ReorderAlbumItemsInput = z.infer<typeof reorderAlbumItemsSchema>;
export type SortAlbumItemsInput = z.infer<typeof sortAlbumItemsSchema>;

// ── AI motion clips (Kling image-to-video) ─────────────────────────

export const createAiClipsSchema = z.object({
  versionId: z.string().min(1).optional(),
  albumId: z.string().min(1).optional(),
  /** Hero images to animate — deliberately capped to keep cost bounded. */
  items: z
    .array(
      z.object({
        assetId: z.string().min(1),
        albumItemId: z.string().min(1).optional(),
      })
    )
    .min(1)
    .max(3),
  prompt: z.string().trim().min(1).max(2000),
  negativePrompt: z.string().trim().max(2000).optional(),
  mode: z.enum(["std", "pro"]).default("std"),
  durationSeconds: z.union([z.literal(5), z.literal(10)]).default(5),
});

export const updateAiClipSchema = z.object({
  accepted: z.boolean(),
});

export type CreateAiClipsInput = z.infer<typeof createAiClipsSchema>;
export type UpdateAiClipInput = z.infer<typeof updateAiClipSchema>;
