import { z } from "zod";

// ─── Shared enums and constants ─────────────────────────────────────────

export const ProjectMode = z.enum(["story", "slideshow", "documentary"]);
export const StoryMode = z.enum(["memory_film", "travel_recap", "family_archive", "event_recap", "social_reel", "documentary"]);
export const EmotionalTone = z.enum(["nostalgic", "joyful", "calm", "epic", "funny", "romantic", "reflective"]);
export const AspectRatio = z.enum(["16:9", "9:16", "1:1", "4:3"]);
export const Resolution = z.enum(["720p", "1080p", "4k"]);
export const FrameRate = z.number().int().positive().default(30);
export const OutputFormat = z.enum(["mp4", "mov", "webm"]).default("mp4");
export const VideoCodec = z.enum(["libx264", "libx265"]).default("libx264");
export const AudioCodec = z.enum(["aac", "libmp3lame"]).default("aac");

export const projectStatus = z.enum(["draft", "ready", "rendering", "completed", "archived"]);
export const renderJobState = z.enum(["queued", "running", "paused", "completed", "failed", "cancelled"]);
export const albumLifecycleStage = z.enum(["draft", "photos_uploaded", "story_generated", "audio_ready", "video_rendered", "published_exported"]);
export const videoTemplateId = z.enum([
  "birthday_recap",
  "vacation_memories",
  "wedding_highlights",
  "baby_first_year",
  "before_after",
  "memorial_tribute",
  "real_estate_showcase",
]);

// ─── File upload constraints ──────────────────────────────────────────

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_BYTES = 500 * 1024 * 1024;
export const MAX_BATCH_SIZE = 200;
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
  "audio/mp4",
  "audio/mpeg",
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

/** Reject path traversal and weird unicode early. */
const safeFilename = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\\/:*?"<>|\u0000-\u001f]+$/, "filename contains invalid characters");

// ─── Project schemas ────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  mode: ProjectMode.default("story"),
  templateId: videoTemplateId.nullable().optional(),
  locale: z.string().min(2).max(10).default("en"),
  aspectRatio: AspectRatio.default("16:9"),
  resolution: Resolution.default("1080p"),
});

export const updateProjectSchema = createProjectSchema.partial();

export const projectResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  mode: ProjectMode,
  locale: z.string(),
  aspectRatio: AspectRatio,
  resolution: Resolution,
  status: projectStatus,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

// ─── Upload schemas ─────────────────────────────────────────────────────

export const presignRequestSchema = z.object({
  filename: safeFilename,
  contentType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().min(MIN_FILE_BYTES).max(MAX_IMAGE_BYTES),
  sessionId: z.string().min(1).max(128).optional(),
});

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

export const zipImportSchema = z.object({
  key: z.string().min(1).max(512),
  sessionId: z.string().min(1).max(128),
  expectedCount: z.number().int().min(1).max(MAX_BATCH_SIZE).optional(),
});

export const promoteSessionSchema = z.object({
  sessionId: z.string().min(1).max(128),
  /** Optional explicit order. When omitted, server uses insertion order of staged assets. */
  orderedKeys: z.array(z.string().min(1).max(512)).max(MAX_BATCH_SIZE).optional(),
  /** If true, delete the upload session after successful promotion. Defaults to true. */
  clearSession: z.boolean().optional(),
});

export const assetResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  type: z.string(),
  originalUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  storageKey: z.string().nullable(),
  thumbnailStorageKey: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  fileSizeBytes: z.number().int().nullable(),
  orderIndex: z.number().int(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PresignRequest = z.infer<typeof presignRequestSchema>;
export type UploadCompletePayload = z.infer<typeof uploadCompleteSchema>;
export type ZipImportPayload = z.infer<typeof zipImportSchema>;
export type PromoteSessionPayload = z.infer<typeof promoteSessionSchema>;
export type AssetResponse = z.infer<typeof assetResponseSchema>;

// ─── Story schemas ──────────────────────────────────────────────────────

export const storyGenerateSchema = z.object({
  projectId: z.string().min(1),
  locale: z.string().optional(),
  mode: z.enum(["story", "slideshow", "documentary"]).optional(),
  storyMode: z.string().optional(),
  userNotes: z.string().max(2000).optional(),
  captions: z.array(z.string()).optional(),
  exifSummary: z.string().optional(),
  totalDurationMs: z.number().int().min(1000).optional(),
});

export const storyUpdateSchema = z.object({
  narrationText: z.string().optional(),
  srtText: z.string().optional(),
});

export const storyResponseSchema = z.object({
  scriptId: z.string(),
  projectId: z.string(),
  narrationText: z.string().nullable(),
  srtText: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  isUserEdited: z.boolean(),
  latencyMs: z.number().int().nullable(),
  createdAt: z.coerce.date(),
});

export type StoryGenerateInput = z.infer<typeof storyGenerateSchema>;
export type StoryUpdateInput = z.infer<typeof storyUpdateSchema>;
export type StoryResponse = z.infer<typeof storyResponseSchema>;

// ─── Render manifest schemas ──────────────────────────────────────────

export const subtitleStyleSchema = z.object({
  fontName: z.string().default("Arial"),
  fontSize: z.number().int().min(8).max(128).default(24),
  fontWeight: z.enum(["normal", "bold"]).default("normal"),
  color: z.string().default("#ffffff"),
  outlineColor: z.string().default("#000000"),
  outlineWidth: z.number().int().min(0).max(8).default(2),
  backgroundColor: z.string().default("transparent"),
  backgroundOpacity: z.number().min(0).max(1).default(0),
  borderRadius: z.number().int().min(0).max(20).default(0),
  padding: z.number().int().min(0).max(40).default(4),
  shadow: z.boolean().default(false),
  shadowColor: z.string().default("#000000"),
  shadowOffset: z.number().int().min(0).max(10).default(2),
  position: z.enum(["bottom", "top", "center"]).default("bottom"),
  alignment: z.enum(["left", "center", "right"]).default("center"),
  marginV: z.number().int().min(0).max(300).default(40),
  marginH: z.number().int().min(0).max(300).default(40),
  maxLineWidth: z.number().int().min(10).max(80).default(42),
  maxLines: z.number().int().min(1).max(4).default(2),
  textTransform: z.enum(["preserve", "uppercase", "lowercase", "sentence"]).default("preserve"),
});

export const subtitleTimingSchema = z.object({
  maxCharsPerSegment: z.number().int().min(20).max(200).default(80),
  minDisplayMs: z.number().int().min(500).max(5000).default(1200),
  maxDisplayMs: z.number().int().min(2000).max(15000).default(7000),
  gapMs: z.number().int().min(0).max(2000).default(100),
  splitOnPunctuation: z.boolean().default(true),
  splitLongSentences: z.boolean().default(true),
});

export const subtitleExportSchema = z.object({
  burnIn: z.boolean().default(true),
  exportSrt: z.boolean().default(false),
  exportVtt: z.boolean().default(false),
});

export const subtitleConfigSchema = z.object({
  presetId: z.string().default("minimal_clean"),
  style: subtitleStyleSchema.default({}),
  timing: subtitleTimingSchema.default({}),
  export: subtitleExportSchema.default({}),
  enabled: z.boolean().default(true),
});

export const motionPresetSchema = z.object({
  name: z.enum(["pan_left", "pan_right", "zoom_in", "zoom_out", "ken_burns", "static"]),
  startScale: z.number().min(1).max(3).default(1),
  endScale: z.number().min(1).max(3).default(1.15),
  startX: z.number().default(0),
  endX: z.number().default(0),
  startY: z.number().default(0),
  endY: z.number().default(0),
  durationSeconds: z.number().positive().default(5),
});

export const transitionPresetSchema = z.object({
  name: z.enum(["fade", "crossfade", "slide_left", "slide_right", "none"]),
  durationSeconds: z.number().min(0).max(2).default(0.5),
});

export const VisualStyle = z.enum([
  "film_grain",
  "polaroid_memory",
  "clean_modern_slideshow",
  "travel_map_overlay",
  "vhs_archive",
  "wedding_cinematic",
  "social_vertical_captions",
]).default("clean_modern_slideshow");

export const renderAssetSchema = z.object({
  storageKey: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().default(5),
  motion: motionPresetSchema.optional(),
  transition: transitionPresetSchema.optional(),
});

export const audioTrackSchema = z.object({
  storageKey: z.string().min(1).optional(),
  type: z.enum(["narration", "music", "sfx"]),
  provider: z.string().optional(),
  downloadUrl: z.string().url().optional(),
  metadata: z.any().optional(),
  volume: z.number().min(0).max(2).default(1),
  fadeInSeconds: z.number().min(0).max(5).default(0),
  fadeOutSeconds: z.number().min(0).max(5).default(0),
  startOffsetSeconds: z.number().min(0).default(0),
  duckGainDuringNarration: z.number().min(0).max(1).optional(),
}).passthrough();

export const renderManifestSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  jobId: z.string().min(1),

  mode: z.enum(["cinematic", "slideshow", "social"]).default("cinematic"),
  visualStyle: VisualStyle,
  targetDurationSeconds: z.number().positive().optional(),
  aspectRatio: AspectRatio.default("16:9"),
  resolution: Resolution.default("1080p"),
  frameRate: FrameRate,

  assets: z.array(renderAssetSchema).min(1).max(200),
  audioTracks: z.array(audioTrackSchema).max(16).default([]),

  narrationText: z.string().optional(),
  srtText: z.string().optional(),
  srtStorageKey: z.string().optional(),
  burnSubtitles: z.boolean().default(true),
  subtitleStyle: subtitleStyleSchema.default({}),
  subtitleTiming: subtitleTimingSchema.default({}),
  subtitleExport: subtitleExportSchema.default({}),
  subtitlePresetId: z.string().optional(),

  outputFormat: OutputFormat,
  videoCodec: VideoCodec,
  audioCodec: AudioCodec,
  videoBitrate: z.string().default("5000k"),
  audioBitrate: z.string().default("192k"),

  maxRetries: z.number().int().min(0).max(5).default(3),
  workerTimeoutSeconds: z.number().int().min(30).max(3600).default(600),
});

export const renderJobResponseSchema = z.object({
  jobId: z.string(),
  state: renderJobState,
  progressPercent: z.number().int().min(0).max(100),
  retryCount: z.number().int().min(0),
  errorSummary: z.string().nullable(),
  logs: z.string().nullable(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  exports: z.array(z.object({
    id: z.string(),
    storageKey: z.string(),
    format: z.string(),
    resolution: z.string().nullable(),
    createdAt: z.coerce.date(),
  })).default([]),
});

export type RenderManifest = z.infer<typeof renderManifestSchema>;
export type RenderAsset = z.infer<typeof renderAssetSchema>;
export type AudioTrack = z.infer<typeof audioTrackSchema>;
export type MotionPreset = z.infer<typeof motionPresetSchema>;
export type TransitionPreset = z.infer<typeof transitionPresetSchema>;
export type SubtitleStyle = z.infer<typeof subtitleStyleSchema>;
export type SubtitleTiming = z.infer<typeof subtitleTimingSchema>;
export type SubtitleExport = z.infer<typeof subtitleExportSchema>;
export type SubtitleConfig = z.infer<typeof subtitleConfigSchema>;
export type VisualStyle = z.infer<typeof VisualStyle>;
export type RenderJobResponse = z.infer<typeof renderJobResponseSchema>;

export function parseManifest(payload: unknown): RenderManifest {
  return renderManifestSchema.parse(payload);
}

export function safeParseManifest(payload: unknown):
  | { success: true; data: RenderManifest }
  | { success: false; error: z.ZodError } {
  const result = renderManifestSchema.safeParse(payload);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

// ─── Audio schemas ────────────────────────────────────────────────────

export const audioTrackCreateSchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["narration", "music", "sfx"]),
  storageKey: z.string().min(1),
  voiceId: z.string().optional(),
  voiceName: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
  volume: z.number().min(0).max(2).default(1),
  fadeInSeconds: z.number().min(0).max(5).default(0),
  fadeOutSeconds: z.number().min(0).max(5).default(0),
  startOffsetSeconds: z.number().min(0).default(0),
  duckGainDuringNarration: z.number().min(0).max(1).optional(),
});

export const audioTrackUpdateSchema = audioTrackCreateSchema.partial().omit({ projectId: true });

export const ttsPreviewSchema = z.object({
  text: z.string().min(1).max(500),
  voiceId: z.string().min(1),
  provider: z.enum(["openai", "elevenlabs"]).optional(),
});

export type AudioTrackCreateInput = z.infer<typeof audioTrackCreateSchema>;
export type AudioTrackUpdateInput = z.infer<typeof audioTrackUpdateSchema>;
export type TTSPreviewInput = z.infer<typeof ttsPreviewSchema>;

// ─── Export schemas ─────────────────────────────────────────────────────

export const exportResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  renderJobId: z.string().nullable(),
  storageKey: z.string(),
  format: z.string(),
  resolution: z.string().nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  fileSizeBytes: z.number().int().positive().nullable(),
  filename: z.string().nullable().optional(),
  userMode: z.enum(["cinematic", "slideshow", "social"]).nullable().optional(),
  renderMode: z.string().nullable().optional(),
  aspectRatio: AspectRatio.nullable().optional(),
  aspectLabel: z.enum(["landscape", "portrait", "1by1"]).nullable().optional(),
  storyKeywords: z.array(z.string()).nullable().optional(),
  previewTitle: z.string().nullable().optional(),
  previewSubtitle: z.string().nullable().optional(),
  signedUrl: z.string().nullable(),
  signedUrlExpiresAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});

export const shareExportSchema = z.object({
  expiryHours: z.number().int().min(1).max(168).default(24),
});

export type ExportResponse = z.infer<typeof exportResponseSchema>;
export type ShareExportInput = z.infer<typeof shareExportSchema>;

// ─── Polling / SSE response schemas ───────────────────────────────────

export const jobPollResponseSchema = z.object({
  jobId: z.string(),
  state: renderJobState,
  progressPercent: z.number().int().min(0).max(100),
  retryCount: z.number().int().min(0),
  errorSummary: z.string().nullable(),
  logs: z.string().nullable(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  exports: z.array(exportResponseSchema).default([]),
});

export const sseEventSchema = z.object({
  event: z.enum(["progress", "state", "completed", "failed", "cancelled", "heartbeat"]),
  jobId: z.string(),
  data: z.record(z.unknown()),
  timestamp: z.coerce.date(),
});

export type JobPollResponse = z.infer<typeof jobPollResponseSchema>;
export type SSEEvent = z.infer<typeof sseEventSchema>;

// ─── Pagination helpers ───────────────────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
      totalPages: z.number().int(),
    }),
  });

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ─── Utility ──────────────────────────────────────────────────────────

export function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue: z.ZodIssue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
