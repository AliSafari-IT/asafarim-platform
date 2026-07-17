/**
 * Shared domain types for Vionto's AI-director layer.
 *
 * These types are the contract between the app and the pluggable AI providers.
 * The rest of the app depends on these + the interfaces in `interfaces.ts`,
 * never on a vendor SDK directly. See docs/ai-architecture.md.
 */

/** Capabilities a provider can offer. One provider may offer several. */
export type AiCapability =
  | "album_analysis"
  | "story"
  | "narration"
  | "generative_video"
  | "render";

/** Every provider we know how to talk to (adapters added incrementally). */
export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "elevenlabs"
  | "google_tts"
  | "kling"
  | "fal"
  | "sora"
  | "runway"
  | "remotion"
  | "ffmpeg";

/** Cost/quality tier a model sits in — drives economy/standard/premium routing. */
export type ProviderTier = "economy" | "standard" | "premium";

/** How a provider authenticates. `none` = local (ffmpeg/remotion). */
export type AuthKind = "api_key" | "key_secret" | "none";

// ─── Album analysis ────────────────────────────────────────────────

export type SuggestedUsage = "primary" | "secondary" | "optional" | "exclude";

export type SuggestedMotion =
  | "zoom_in"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "static"
  | "parallax"
  | "collage";

export interface AnalyzedAsset {
  assetId: string;
  description: string;
  qualityScore: number; // 0..1
  importanceScore: number; // 0..1
  duplicateGroupId?: string;
  suggestedUsage: SuggestedUsage;
  cropFocus?: { x: number; y: number }; // 0..1 normalized
  suggestedMotion: SuggestedMotion;
}

export interface DetectedPerson {
  /** Neutral identifier only, e.g. `person_1`. Never a claimed real identity. */
  id: string;
  visualDescription: string;
  occurrenceCount: number;
  userAssignedName?: string;
}

export interface AlbumMoment {
  id: string;
  title: string;
  description: string;
  assetIds: string[];
  estimatedSequence: number;
  emotionalTone: string;
}

export interface AnalysisWarning {
  code: string;
  message: string;
  assetId?: string;
}

export interface AlbumAnalysisResult {
  titleSuggestion?: string;
  albumSummary: string;
  detectedPeople: DetectedPerson[];
  moments: AlbumMoment[];
  assets: AnalyzedAsset[];
  suggestedOrder: string[]; // assetIds in suggested display order
  warnings: AnalysisWarning[];
}

export interface AlbumAnalysisInput {
  /** Resized analysis-thumbnail URLs (never full-resolution originals). */
  assets: Array<{ assetId: string; imageUrl: string; takenAt?: string; gps?: { lat: number; lng: number } }>;
  locale: string;
  occasion?: string;
  /** Names the user has already mapped to person ids, if any. */
  knownPeople?: Array<{ id: string; name: string }>;
}

// ─── Story planning ────────────────────────────────────────────────

export type StoryTone =
  | "warm"
  | "emotional"
  | "funny"
  | "cinematic"
  | "documentary"
  | "romantic"
  | "energetic"
  | "minimal"
  | "professional"
  | "child_friendly";

export type SceneType = "opening" | "story" | "transition" | "filler" | "closing";

export interface StoryScene {
  id: string;
  order: number;
  type: SceneType;
  narration: string;
  assetIds: string[];
  estimatedDurationSeconds: number;
  visualLayout: string; // template-defined layout key
  motionPreset: SuggestedMotion;
  transitionIn: string;
  transitionOut: string;
  caption?: string;
  musicMood?: string;
  emotionalTone?: string;
  needsGeneratedFiller: boolean;
  generatedFillerReason?: string;
  generatedFillerPrompt?: string;
}

export interface StoryPlan {
  titleSuggestion?: string;
  scenes: StoryScene[];
  language: string;
  tone: StoryTone;
  estimatedTotalSeconds: number;
}

export interface StoryPlanningInput {
  mode: "ai" | "user" | "assisted";
  locale: string;
  tone: StoryTone;
  targetDurationSeconds: number;
  analysis?: AlbumAnalysisResult;
  /** For `user`/`assisted` modes: the text the user provided. */
  userText?: string;
  title?: string;
  occasion?: string;
  names?: string[];
}

// ─── Narration ─────────────────────────────────────────────────────

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface NarrationInput {
  text: string;
  voiceId: string;
  language: string;
  tier: ProviderTier;
  speed?: number;
  expressiveness?: number;
}

export interface NarrationResult {
  audio: Buffer;
  contentType: string; // e.g. "audio/mpeg"
  provider: AiProviderId;
  voiceId: string;
  model?: string;
  durationMs?: number;
  wordTimings?: WordTiming[];
  latencyMs: number;
}

// ─── Generative video (optional premium filler) ────────────────────

export interface GeneratedClipInput {
  /** Short-lived, fetchable image URL or base64 payload. */
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds: 5 | 10;
  aspectRatio: "16:9" | "9:16" | "1:1";
  mode?: "std" | "pro";
  /** Our id, echoed back for correlation. */
  externalTaskId?: string;
  model?: string;
}

export type GeneratedClipStatus = "submitted" | "processing" | "succeeded" | "failed";

export interface GeneratedClipTask {
  taskId: string;
  status: GeneratedClipStatus;
  statusMessage: string | null;
  /** Present when succeeded — temporary URL, download promptly. */
  videos: Array<{ id: string; url: string; duration: number | null }>;
  raw: Record<string, unknown>;
}

export interface GeneratedClipResult {
  task: GeneratedClipTask;
}

// ─── Rendering ─────────────────────────────────────────────────────

export type RenderKind = "preview" | "final";

export interface RenderResult {
  outputStorageKey: string;
  durationSeconds: number;
  sizeBytes?: number;
  kind: RenderKind;
}

// ─── Common ────────────────────────────────────────────────────────

/** Resolved credential + selection passed to an adapter factory. */
export interface ProviderContext {
  provider: AiProviderId;
  model: string;
  /** Resolved key (user BYOK or server env). Absent for local providers. */
  apiKey?: string;
  apiSecret?: string;
}
