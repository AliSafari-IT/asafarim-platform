/**
 * The five provider interfaces the AI-director layer depends on.
 * Vendor adapters implement these; the rest of the app never imports a
 * vendor SDK directly. See docs/ai-architecture.md.
 */
import type {
  AlbumAnalysisInput,
  AlbumAnalysisResult,
  GeneratedClipInput,
  GeneratedClipResult,
  GeneratedClipTask,
  NarrationInput,
  NarrationResult,
  RenderResult,
  StoryPlan,
  StoryPlanningInput,
} from "./types";

export interface AlbumAnalyzer {
  analyzeAlbum(input: AlbumAnalysisInput): Promise<AlbumAnalysisResult>;
}

export interface StoryPlanner {
  createStoryPlan(input: StoryPlanningInput): Promise<StoryPlan>;
}

export interface NarrationProvider {
  synthesizeNarration(input: NarrationInput): Promise<NarrationResult>;
}

export interface GenerativeVideoProvider {
  /** Submit an async image-to-video task. */
  generateClip(input: GeneratedClipInput): Promise<GeneratedClipResult>;
  /** Poll a previously submitted task. */
  getClip(taskId: string): Promise<GeneratedClipTask>;
  /** Download a finished clip (temporary provider URL) into a Buffer. */
  downloadClip(url: string): Promise<Buffer>;
}

/** Minimal shape a renderer needs — expanded as the scene plan lands. */
export interface RenderableProject {
  projectId: string;
  versionId?: string;
  userId: string;
  jobId: string;
  /** Opaque manifest the concrete renderer knows how to consume. */
  manifest: unknown;
}

export interface VideoRenderer {
  renderPreview(project: RenderableProject): Promise<RenderResult>;
  renderFinal(project: RenderableProject): Promise<RenderResult>;
}
