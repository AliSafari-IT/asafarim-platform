import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import {
  generateWithOpenAI,
  generateWithAnthropic,
  buildStorySystemPrompt,
  buildStoryUserPrompt,
} from "@/lib/server/story-generation";
import { generateSrtFromText, isValidSrt } from "@/lib/server/srt";
import { buildExifSummary, formatExifSummaryForPrompt } from "@/lib/server/exif";
import { generateImageCaption } from "@/lib/server/vision";
import { advanceAlbumLifecycleStage } from "@/lib/server/album-lifecycle";

export const runtime = "nodejs";

const MAX_NOTES_LENGTH = 2000;
const PROMPT_VERSION = "vionto-story-v1";

type GenerateBody = {
  projectId: string;
  /** Optional video version — when provided, creative settings come from the version. */
  versionId?: string;
  /** Optional album to use for image subset, order, and per-image metadata. */
  albumId?: string;
  locale?: string;
  mode?: "story" | "slideshow" | "documentary";
  storyMode?: string;
  emotionalTone?: string;
  visualStyle?: string;
  userNotes?: string;
  captions?: string[];
  exifSummary?: string;
  totalDurationMs?: number;
};

export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      console.error("[story/generate] Unauthorized - no user found");
      return unauthorized();
    }

    let body: GenerateBody;
    try {
      body = (await req.json()) as GenerateBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const { projectId, versionId, albumId, locale = "en", mode = "story", storyMode, emotionalTone, visualStyle, userNotes, captions, exifSummary } = body;
    if (!projectId || typeof projectId !== "string") {
      return badRequest("projectId is required.");
    }
    if (userNotes && userNotes.length > MAX_NOTES_LENGTH) {
      return badRequest("userNotes exceeds maximum length.");
    }

    console.log(`[story/generate] Starting generation for project ${projectId}, version ${versionId ?? "none"}, user ${user.id}`);

    // Verify project ownership
    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true, locale: true, mode: true, storyMode: true, emotionalTone: true, visualStyle: true, musicOption: true, targetDurationSeconds: true },
    });
    if (!project) {
      console.error(`[story/generate] Project ${projectId} not found for user ${user.id}`);
      return badRequest("Project not found.");
    }

    // If a versionId is provided, load creative settings from the version.
    // Otherwise fall back to project-level settings (backward compat).
    let versionRecord: { id: string; albumId: string | null; mode: string; storyMode: string | null; emotionalTone: string | null; visualStyle: string | null; musicOption: string | null; targetDurationSeconds: number | null; storyStructure: unknown; captionOverlaySettings: unknown } | null = null;
    if (versionId && typeof versionId === "string") {
      versionRecord = await prisma.viontoVideoVersion.findFirst({
        where: { id: versionId, projectId },
        select: { id: true, albumId: true, mode: true, storyMode: true, emotionalTone: true, visualStyle: true, musicOption: true, targetDurationSeconds: true, storyStructure: true, captionOverlaySettings: true },
      });
      if (!versionRecord) return badRequest("Video version not found.");
    }

    // Resolve effective settings: request body > version > project
    const settingsSource = versionRecord ?? project;
    const effectiveLocale = locale || project.locale || "en";
    const effectiveMode = (mode || settingsSource.mode || "story") as "story" | "slideshow" | "documentary";
    const effectiveStoryMode = storyMode || settingsSource.storyMode || "memory_film";
    const effectiveEmotionalTone = emotionalTone || settingsSource.emotionalTone || "nostalgic";
    const effectiveVisualStyle = visualStyle || settingsSource.visualStyle || "clean_modern_slideshow";

    // Use version's album if no explicit albumId provided
    const effectiveAlbumId = albumId ?? versionRecord?.albumId ?? null;

    // Derive total duration from the version/project's persisted target.
    const DEFAULT_DURATION_SECONDS = 30;
    const effectiveTargetDurationSeconds = settingsSource.targetDurationSeconds ?? DEFAULT_DURATION_SECONDS;
    const totalDurationMs = effectiveTargetDurationSeconds * 1_000;

    // Query assets — if an albumId is supplied, use album item order/subset/metadata.
    // Otherwise fall back to the full project asset list ordered by orderIndex.
    type AssetRow = {
      id: string;
      storageKey: string | null;
      caption: string | null;
      captionProvider: string | null;
      captionModel: string | null;
      captionGeneratedAt: Date | null;
      metadata: unknown;
      orderIndex: number;
      /** Album-specific semantic metadata (populated when albumId is used). */
      albumItemMetadata?: unknown;
    };

    let assets: AssetRow[];

    if (effectiveAlbumId && typeof effectiveAlbumId === "string") {
      // Verify the album belongs to this project.
      const album = await prisma.viontoAlbum.findFirst({
        where: { id: effectiveAlbumId, projectId },
        select: { id: true },
      });
      if (!album) return badRequest("Album not found.");

      const albumItems = await prisma.viontoAlbumItem.findMany({
        where: { albumId: effectiveAlbumId, hidden: false },
        orderBy: { orderIndex: "asc" },
        select: {
          orderIndex: true,
          metadata: true,
          asset: {
            select: {
              id: true,
              storageKey: true,
              caption: true,
              captionProvider: true,
              captionModel: true,
              captionGeneratedAt: true,
              metadata: true,
              type: true,
            },
          },
        },
      });

      assets = albumItems
        .filter((item) => item.asset.type === "source_image")
        .map((item) => ({
          id: item.asset.id,
          storageKey: item.asset.storageKey,
          caption: item.asset.caption,
          captionProvider: item.asset.captionProvider,
          captionModel: item.asset.captionModel,
          captionGeneratedAt: item.asset.captionGeneratedAt,
          metadata: item.asset.metadata,
          orderIndex: item.orderIndex,
          albumItemMetadata: item.metadata,
        }));
    } else {
      assets = await prisma.viontoAsset.findMany({
        where: { projectId, type: "source_image" },
        select: {
          id: true,
          storageKey: true,
          caption: true,
          captionProvider: true,
          captionModel: true,
          captionGeneratedAt: true,
          metadata: true,
          orderIndex: true,
        },
        orderBy: { orderIndex: "asc" },
      });
    }

    // Generate captions for assets that don't have them (up to 5 at a time to avoid timeout)
    const assetsNeedingCaptions = assets.filter((a): a is typeof a & { storageKey: string } => !a.caption && typeof a.storageKey === "string");
    console.log(`[story/generate] ${assetsNeedingCaptions.length} assets need captions`);
    if (assetsNeedingCaptions.length > 0) {
      const captionBatch = assetsNeedingCaptions.slice(0, 5);
      for (const asset of captionBatch) {
        try {
          console.log(`[story/generate] Generating caption for asset ${asset.id}`);
          const captionResult = await generateImageCaption(asset.storageKey, effectiveLocale);
          await prisma.viontoAsset.update({
            where: { id: asset.id },
            data: {
              caption: captionResult.caption,
              captionProvider: captionResult.provider,
              captionModel: captionResult.model,
              captionGeneratedAt: new Date(),
            },
          });
        } catch (error) {
          console.error(`[story/generate] Failed to caption asset ${asset.id}:`, error);
        }
      }
      // Reload assets to get the newly generated captions
      const updatedAssets = await prisma.viontoAsset.findMany({
        where: { projectId, type: "source_image" },
        select: {
          id: true,
          caption: true,
          orderIndex: true,
        },
        orderBy: { orderIndex: "asc" },
      });
      assets.forEach((asset, idx) => {
        const updated = updatedAssets.find(a => a.id === asset.id);
        if (updated) {
          asset.caption = updated.caption;
        }
      });
    }

    // Extract captions from assets.
    // When album-item metadata is present, append it to the caption for richer context.
    const assetCaptions = assets
      .filter((a): a is typeof a & { caption: string } => typeof a.caption === "string" && a.caption.length > 0)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((a) => {
        let caption = a.caption;
        if (a.albumItemMetadata && typeof a.albumItemMetadata === "object") {
          const metaStr = Object.entries(a.albumItemMetadata as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(", ");
          if (metaStr) caption = `${caption} [${metaStr}]`;
        }
        return caption;
      });

    // Build EXIF summary
    const exifSummaryData = await buildExifSummary(projectId);
    const exifSummaryText = formatExifSummaryForPrompt(exifSummaryData, effectiveLocale);

    // Use server-side data if client didn't provide it
    const effectiveCaptions = captions && captions.length > 0 ? captions : assetCaptions;
    const effectiveExifSummary = exifSummary || exifSummaryText;

    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      console.error("[story/generate] No AI provider keys configured");
      return NextResponse.json(
        { error: "No AI provider key is configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY." },
        { status: 500 },
      );
    }

    const systemPrompt = buildStorySystemPrompt(effectiveLocale);
    // Parse story structure from the version if available
    const rawStoryStructure = versionRecord?.storyStructure;
    const storyStructure = rawStoryStructure && typeof rawStoryStructure === "object"
      ? rawStoryStructure as { openingTitle?: string; introNarration?: string; chapters?: { title: string; description: string }[]; climaxDescription?: string; closingMessage?: string; dedicationText?: string }
      : undefined;

    const userPrompt = buildStoryUserPrompt({
      locale: effectiveLocale,
      mode: effectiveMode,
      storyMode: effectiveStoryMode,
      emotionalTone: effectiveEmotionalTone,
      visualStyle: effectiveVisualStyle,
      userNotes,
      captions: effectiveCaptions,
      exifSummary: effectiveExifSummary,
      targetDurationSeconds: effectiveTargetDurationSeconds,
      storyStructure,
    });

    console.log(`[story/generate] Starting AI generation with ${effectiveCaptions.length} captions`);
    const startedAt = Date.now();
    const errors: string[] = [];

    const openAIResult = await generateWithOpenAI(systemPrompt, userPrompt);
    let success = "output" in openAIResult ? openAIResult : null;
    if (!success && "error" in openAIResult) {
      console.error(`[story/generate] OpenAI failed: ${openAIResult.error}`);
      errors.push(`OpenAI: ${openAIResult.error}`);
    }

    if (!success) {
      console.log("[story/generate] Falling back to Anthropic");
      const anthropicResult = await generateWithAnthropic(systemPrompt, userPrompt);
      if ("output" in anthropicResult) {
        success = anthropicResult;
      } else {
        console.error(`[story/generate] Anthropic failed: ${anthropicResult.error}`);
        errors.push(`Anthropic: ${anthropicResult.error}`);
      }
    }

    const latencyMs = Date.now() - startedAt;
    console.log(`[story/generate] AI generation completed in ${latencyMs}ms`);

    if (!success) {
      const errorMessage = errors.length > 0 ? errors.join(" | ") : "Failed to generate story from all providers.";
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }

    // Parse JSON output from LLM (or fallback to plain text)
    let narration = success.output;
    let srtText: string | null = null;
    try {
      const parsed = JSON.parse(success.output) as { narration?: string; srt?: string };
      if (typeof parsed.narration === "string") narration = parsed.narration;
      if (typeof parsed.srt === "string") srtText = parsed.srt;
    } catch {
      // Not valid JSON; treat entire output as narration
    }

    // Fallback SRT generation if LLM didn't produce valid SRT
    if (!srtText || !isValidSrt(srtText)) {
      const cues = generateSrtFromText(narration, 0, totalDurationMs);
      const lines: string[] = [];
      for (const cue of cues) {
        lines.push(String(cue.index));
        const pad = (n: number) => String(n).padStart(2, "0");
        const fmt = (ms: number) => {
          const h = Math.floor(ms / 3_600_000);
          const m = Math.floor((ms % 3_600_000) / 60_000);
          const s = Math.floor((ms % 60_000) / 1000);
          const milli = Math.floor(ms % 1000);
          return `${pad(h)}:${pad(m)}:${pad(s)},${String(milli).padStart(3, "0")}`;
        };
        lines.push(`${fmt(cue.startMs)} --> ${fmt(cue.endMs)}`);
        lines.push(cue.text);
        lines.push("");
      }
      srtText = lines.join("\n");
    }

    // Persist script with provider metadata
    console.log(`[story/generate] Saving script to database`);
    let script;
    try {
      script = await prisma.viontoScript.create({
        data: {
          projectId,
          versionId: versionRecord?.id ?? null,
          userId: user.id,
          promptVersion: PROMPT_VERSION,
          provider: success.provider,
          model: success.model,
          narrationText: narration,
          srtText: srtText,
          musicOption: settingsSource.musicOption || null,
          promptTokens: success.promptTokens ?? null,
          completionTokens: success.completionTokens ?? null,
          totalTokens: success.totalTokens ?? null,
          latencyMs,
        },
      });
    } catch (dbError) {
      console.error(`[story/generate] Database error saving script:`, dbError);
      return serverError("story/generate/db", dbError);
    }

    console.log(`[story/generate] Successfully created script ${script.id}`);
    await advanceAlbumLifecycleStage(prisma, {
      projectId,
      albumId: effectiveAlbumId,
      stage: "story_generated",
    });
    return NextResponse.json({
      scriptId: script.id,
      narration,
      srt: srtText,
      provider: success.provider,
      model: success.model,
      latencyMs,
      tokens: {
        prompt: success.promptTokens,
        completion: success.completionTokens,
        total: success.totalTokens,
      },
    });
  } catch (error) {
    console.error(`[story/generate] Unhandled error:`, error);
    return serverError("story/generate", error);
  }
}
