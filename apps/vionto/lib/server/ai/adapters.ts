/**
 * Vendor adapters implementing the AI-director interfaces by delegating to
 * Vionto's existing provider functions. Phase A establishes the pattern and
 * keeps behavior identical; later phases enrich these (scene-level story
 * planning in Phase C, fal.ai video + resolved BYOK keys in Phase G).
 */
import {
  generateWithOpenAI,
  generateWithAnthropic,
  buildStorySystemPrompt,
  buildStoryUserPrompt,
} from "../story-generation";
import { ttsOpenAI, ttsElevenLabs } from "../tts";
import {
  createImageToVideoTask,
  getImageToVideoTask,
  downloadClip as klingDownloadClip,
  type KlingTaskStatus,
} from "../kling";
import {
  submitFalTask,
  getFalStatus,
  getFalResult,
  downloadFalClip,
  type FalQueueStatus,
} from "../fal";
import type {
  AlbumAnalyzer,
  GenerativeVideoProvider,
  NarrationProvider,
  StoryPlanner,
} from "./interfaces";
import type {
  GeneratedClipInput,
  GeneratedClipStatus,
  GeneratedClipTask,
  NarrationInput,
  NarrationResult,
  StoryPlan,
  StoryPlanningInput,
} from "./types";

// ─── Story (minimal Phase-A wrap; scene splitting lands in Phase C) ──

function singleScenePlan(input: StoryPlanningInput, narration: string): StoryPlan {
  return {
    scenes: [
      {
        id: "scene_1",
        order: 0,
        type: "story",
        narration,
        assetIds: input.analysis?.suggestedOrder ?? [],
        estimatedDurationSeconds: input.targetDurationSeconds,
        visualLayout: "single",
        motionPreset: "zoom_in",
        transitionIn: "fade",
        transitionOut: "fade",
        needsGeneratedFiller: false,
      },
    ],
    language: input.locale,
    tone: input.tone,
    estimatedTotalSeconds: input.targetDurationSeconds,
  };
}

function extractNarration(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { narration?: string };
    if (typeof parsed.narration === "string" && parsed.narration.trim()) {
      return parsed.narration.trim();
    }
  } catch {
    // Not JSON — treat the whole output as narration text.
  }
  return raw.trim();
}

class DelegatingStoryPlanner implements StoryPlanner {
  constructor(private readonly vendor: "openai" | "anthropic") {}

  async createStoryPlan(input: StoryPlanningInput): Promise<StoryPlan> {
    const system = buildStorySystemPrompt(input.locale);
    const user = buildStoryUserPrompt({
      locale: input.locale,
      mode: "story",
      emotionalTone: input.tone,
      userNotes: input.userText,
      captions: input.analysis?.assets.map((a) => a.description),
      targetDurationSeconds: input.targetDurationSeconds,
    });
    const result =
      this.vendor === "openai"
        ? await generateWithOpenAI(system, user)
        : await generateWithAnthropic(system, user);
    if ("error" in result) {
      throw new Error(`Story generation failed: ${result.error}`);
    }
    return singleScenePlan(input, extractNarration(result.output));
  }
}

export const OpenAIStoryPlanner = new DelegatingStoryPlanner("openai");
export const AnthropicStoryPlanner = new DelegatingStoryPlanner("anthropic");

// ─── Narration ──────────────────────────────────────────────────────

class OpenAINarrationProviderImpl implements NarrationProvider {
  async synthesizeNarration(input: NarrationInput): Promise<NarrationResult> {
    const res = await ttsOpenAI(input.text, input.voiceId);
    if (!res.ok) throw new Error(`Narration failed: ${res.error}`);
    return {
      audio: res.audioBuffer,
      contentType: "audio/mpeg",
      provider: "openai",
      voiceId: res.voiceId,
      model: res.model,
      durationMs: res.durationSeconds ? Math.round(res.durationSeconds * 1000) : undefined,
      latencyMs: res.latencyMs,
    };
  }
}

class ElevenLabsNarrationProviderImpl implements NarrationProvider {
  async synthesizeNarration(input: NarrationInput): Promise<NarrationResult> {
    const res = await ttsElevenLabs(input.text, input.voiceId);
    if (!res.ok) throw new Error(`Narration failed: ${res.error}`);
    return {
      audio: res.audioBuffer,
      contentType: "audio/mpeg",
      provider: "elevenlabs",
      voiceId: res.voiceId,
      model: res.model,
      durationMs: res.durationSeconds ? Math.round(res.durationSeconds * 1000) : undefined,
      latencyMs: res.latencyMs,
    };
  }
}

export const OpenAINarrationProvider = new OpenAINarrationProviderImpl();
export const ElevenLabsNarrationProvider = new ElevenLabsNarrationProviderImpl();

// ─── Generative video (gated premium filler) ────────────────────────

/** Kling uses "succeed"; our contract uses "succeeded". */
function mapClipStatus(status: KlingTaskStatus): GeneratedClipStatus {
  return status === "succeed" ? "succeeded" : status;
}

function toClipTask(task: {
  taskId: string;
  status: KlingTaskStatus;
  statusMessage: string | null;
  videos: Array<{ id: string; url: string; duration: number | null }>;
  raw: Record<string, unknown>;
}): GeneratedClipTask {
  return {
    taskId: task.taskId,
    status: mapClipStatus(task.status),
    statusMessage: task.statusMessage,
    videos: task.videos,
    raw: task.raw,
  };
}

class KlingVideoProviderImpl implements GenerativeVideoProvider {
  async generateClip(input: GeneratedClipInput) {
    const task = await createImageToVideoTask({
      imageUrl: input.imageUrl,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      mode: input.mode ?? "std",
      durationSeconds: input.durationSeconds,
      externalTaskId: input.externalTaskId,
      model: input.model,
    });
    return { task: toClipTask(task) };
  }

  async getClip(taskId: string) {
    return toClipTask(await getImageToVideoTask(taskId));
  }

  downloadClip(url: string): Promise<Buffer> {
    return klingDownloadClip(url);
  }
}

export const KlingVideoProvider = new KlingVideoProviderImpl();

// ─── Generative video: fal.ai (LTX / WAN / Kling under one key) ──────

const LTX_MODEL_PREFIX = "fal-ai/ltx-video";

/** fal queue status → our clip status. COMPLETED maps to succeeded only when
 *  a video URL is present; the caller downgrades to "failed" otherwise. */
function mapFalStatus(status: FalQueueStatus): GeneratedClipStatus {
  if (status === "IN_QUEUE") return "submitted";
  if (status === "IN_PROGRESS") return "processing";
  return "succeeded"; // COMPLETED
}

/** fal has no single result envelope — pull the first video URL + duration. */
function extractFalVideo(result: Record<string, unknown>): { id: string; url: string; duration: number | null } | null {
  const video = result.video as { url?: string; duration?: number } | undefined;
  if (video?.url) return { id: "0", url: video.url, duration: video.duration ?? null };
  const videos = result.videos as Array<{ url?: string; duration?: number }> | undefined;
  if (videos?.[0]?.url) return { id: "0", url: videos[0].url!, duration: videos[0].duration ?? null };
  return null;
}

/** fal encodes the model in the taskId so getClip can rebuild the queue path. */
function encodeFalTaskId(model: string, requestId: string): string {
  return `${model}::${requestId}`;
}
function decodeFalTaskId(taskId: string): { model: string; requestId: string } {
  const idx = taskId.lastIndexOf("::");
  if (idx === -1) throw new Error(`Malformed fal task id: ${taskId}`);
  return { model: taskId.slice(0, idx), requestId: taskId.slice(idx + 2) };
}

class FalVideoProviderImpl implements GenerativeVideoProvider {
  constructor(private readonly apiKey: string) {}

  async generateClip(input: GeneratedClipInput) {
    const model = input.model;
    if (!model) throw new Error("A fal model id is required.");

    // LTX takes only image_url + prompt; richer models accept duration/aspect.
    const body: Record<string, unknown> = {
      image_url: input.imageUrl,
      prompt: input.prompt,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    };
    if (!model.startsWith(LTX_MODEL_PREFIX)) {
      body.duration = String(input.durationSeconds);
      body.aspect_ratio = input.aspectRatio;
    }

    const submit = await submitFalTask(this.apiKey, model, body);
    return {
      task: {
        taskId: encodeFalTaskId(model, submit.requestId),
        status: mapFalStatus(submit.status),
        statusMessage: null,
        videos: [],
        raw: { request_id: submit.requestId },
      },
    };
  }

  async getClip(taskId: string): Promise<GeneratedClipTask> {
    const { model, requestId } = decodeFalTaskId(taskId);
    const status = await getFalStatus(this.apiKey, model, requestId);
    if (status !== "COMPLETED") {
      return { taskId, status: mapFalStatus(status), statusMessage: null, videos: [], raw: { status } };
    }
    const result = await getFalResult(this.apiKey, model, requestId);
    const video = extractFalVideo(result);
    if (!video) {
      return {
        taskId,
        status: "failed",
        statusMessage: "fal.ai completed without a video URL.",
        videos: [],
        raw: result,
      };
    }
    return { taskId, status: "succeeded", statusMessage: null, videos: [video], raw: result };
  }

  downloadClip(url: string): Promise<Buffer> {
    return downloadFalClip(url);
  }
}

/** fal is BYOK — bind the resolved key when constructing the provider. */
export function createFalVideoProvider(apiKey: string): GenerativeVideoProvider {
  return new FalVideoProviderImpl(apiKey);
}

// Album analysis adapter is introduced in Phase B (structured AlbumAnalysis).
export type { AlbumAnalyzer };
