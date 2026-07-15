import { z } from "zod";
import { VISUAL_STYLE_VALUES } from "../visual-styles";

/**
 * Render manifest — shared contract between web UI, mobile app, and the
 * FFmpeg worker.  Every render job deserializes this manifest to build the
 * final command pipeline.
 */

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

export const visualStyleSchema = z.enum(VISUAL_STYLE_VALUES).default("clean_modern_slideshow");

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
  voiceId: z.string().min(1).optional(),
  voiceName: z.string().optional(),
  volume: z.number().min(0).max(2).default(1),
  fadeInSeconds: z.number().min(0).max(5).default(0),
  fadeOutSeconds: z.number().min(0).max(5).default(0),
  startOffsetSeconds: z.number().min(0).default(0),
  duckGainDuringNarration: z.number().min(0).max(1).optional(),
}).passthrough();

export const renderManifestSchema = z.object({
  projectId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  userId: z.string().min(1),
  jobId: z.string().min(1),

  mode: z.enum(["cinematic", "slideshow", "social"]).default("cinematic"),
  visualStyle: visualStyleSchema,
  storyMode: z.string().optional(),
  emotionalTone: z.string().optional(),
  targetDurationSeconds: z.number().positive().optional(),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:3"]).default("16:9"),
  resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  frameRate: z.number().int().positive().default(30),

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

  // Story structure & caption overlays (#102)
  storyStructure: z.object({
    openingTitle: z.string().default(""),
    introNarration: z.string().default(""),
    chapters: z.array(z.object({
      title: z.string().default(""),
      description: z.string().default(""),
    })).default([]),
    climaxDescription: z.string().default(""),
    closingMessage: z.string().default(""),
    dedicationText: z.string().default(""),
  }).optional(),
  captionOverlays: z.array(z.object({
    assetIndex: z.number().int().min(0).optional(),
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    text: z.string(),
    kind: z.enum(["scene", "date", "location", "person"]),
  })).optional(),
  captionOverlaySettings: z.object({
    enabled: z.boolean().default(false),
    showSceneCaptions: z.boolean().default(true),
    showDateCaptions: z.boolean().default(true),
    showLocationCaptions: z.boolean().default(true),
    showPeopleLabels: z.boolean().default(false),
    placement: z.enum(["top", "bottom", "lower_third", "corner"]).default("lower_third"),
    stylePreset: z.enum(["minimal", "memory", "social", "documentary"]).default("minimal"),
  }).optional(),

  outputFormat: z.enum(["mp4", "mov", "webm"]).default("mp4"),
  videoCodec: z.enum(["libx264", "libx265"]).default("libx264"),
  audioCodec: z.enum(["aac", "libmp3lame"]).default("aac"),
  videoBitrate: z.string().default("5000k"),
  audioBitrate: z.string().default("192k"),

  // Retry / worker metadata
  maxRetries: z.number().int().min(0).max(5).default(3),
  workerTimeoutSeconds: z.number().int().min(30).max(3600).default(600),
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
export type VisualStyle = z.infer<typeof visualStyleSchema>;
export type CaptionOverlay = NonNullable<RenderManifest["captionOverlays"]>[number];

/** Validate and parse a raw manifest payload. */
export function parseManifest(payload: unknown): RenderManifest {
  return renderManifestSchema.parse(payload);
}

/** Safe parse that returns a result object instead of throwing. */
export function safeParseManifest(payload: unknown):
  | { success: true; data: RenderManifest }
  | { success: false; error: z.ZodError } {
  const result = renderManifestSchema.safeParse(payload);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
