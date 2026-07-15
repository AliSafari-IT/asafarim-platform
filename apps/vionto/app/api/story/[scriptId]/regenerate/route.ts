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

export const runtime = "nodejs";

const MAX_NOTES_LENGTH = 2000;
const PROMPT_VERSION = "vionto-story-v2";

/**
 * POST /api/story/[scriptId]/regenerate
 *
 * Regenerates narration for an existing script, preserving user-edited SRT if it exists.
 * If the user has edited the narration, it uses that as the base for the new generation.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { scriptId } = await params;

    const existing = await prisma.viontoScript.findFirst({
      where: { id: scriptId, userId: user.id },
      select: {
        id: true,
        projectId: true,
        narrationText: true,
        srtText: true,
        isUserEdited: true,
      },
    });
    if (!existing) {
      return badRequest("Script not found.");
    }

    const project = await prisma.viontoProject.findFirst({
      where: { id: existing.projectId, userId: user.id },
      select: { locale: true, mode: true, title: true },
    });
    if (!project) {
      return badRequest("Project not found.");
    }

    let body: {
      locale?: string;
      mode?: "story" | "slideshow" | "documentary";
      userNotes?: string;
      totalDurationMs?: number;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const {
      locale = project.locale ?? "en",
      mode = project.mode ?? "story",
      userNotes,
      totalDurationMs = 30_000,
    } = body;

    if (userNotes && userNotes.length > MAX_NOTES_LENGTH) {
      return badRequest("userNotes exceeds maximum length.");
    }

    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "No AI provider key is configured." },
        { status: 500 }
      );
    }

    // Build prompts using previous narration as context for continuity
    const systemPrompt = buildStorySystemPrompt(locale);
    const userPrompt = buildStoryUserPrompt({
      locale,
      mode: mode as "story" | "slideshow" | "documentary",
      userNotes: userNotes
        ? `Previous version:\n${existing.narrationText ?? ""}\n\nNew direction:\n${userNotes}`
        : `Regenerate with new creative direction based on project: ${project.title ?? ""}.\n\nPrevious version:\n${existing.narrationText ?? ""}`,
    });

    const startedAt = Date.now();
    const errors: string[] = [];

    const openAIResult = await generateWithOpenAI(systemPrompt, userPrompt);
    let success = "output" in openAIResult ? openAIResult : null;
    if (!success && "error" in openAIResult) errors.push(`OpenAI: ${openAIResult.error}`);

    if (!success) {
      const anthropicResult = await generateWithAnthropic(systemPrompt, userPrompt);
      if ("output" in anthropicResult) {
        success = anthropicResult;
      } else {
        errors.push(`Anthropic: ${anthropicResult.error}`);
      }
    }

    if (!success) {
      return NextResponse.json(
        { error: errors.join(" | ") || "Failed to regenerate story." },
        { status: 502 }
      );
    }

    let narration = success.output;
    let srtText = existing.srtText;
    try {
      const parsed = JSON.parse(success.output) as { narration?: string; srt?: string };
      if (typeof parsed.narration === "string") narration = parsed.narration;
      if (typeof parsed.srt === "string" && isValidSrt(parsed.srt)) srtText = parsed.srt;
    } catch {
      // not JSON
    }

    // Regenerate SRT from new narration if the old one is invalid or missing
    if (!srtText || !isValidSrt(srtText)) {
      const cues = generateSrtFromText(narration, 0, totalDurationMs);
      const lines: string[] = [];
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (ms: number) => {
        const h = Math.floor(ms / 3_600_000);
        const m = Math.floor((ms % 3_600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1000);
        const milli = Math.floor(ms % 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)},${String(milli).padStart(3, "0")}`;
      };
      for (const cue of cues) {
        lines.push(String(cue.index));
        lines.push(`${fmt(cue.startMs)} --> ${fmt(cue.endMs)}`);
        lines.push(cue.text);
        lines.push("");
      }
      srtText = lines.join("\n");
    }

    const newScript = await prisma.viontoScript.create({
      data: {
        projectId: existing.projectId,
        userId: user.id,
        promptVersion: PROMPT_VERSION,
        provider: success.provider,
        model: success.model,
        narrationText: narration,
        srtText,
        promptTokens: success.promptTokens ?? null,
        completionTokens: success.completionTokens ?? null,
        totalTokens: success.totalTokens ?? null,
        latencyMs: Date.now() - startedAt,
      }
    });

    return NextResponse.json({
      scriptId: newScript.id,
      narration,
      srt: srtText,
      provider: success.provider,
      model: success.model,
      latencyMs: Date.now() - startedAt,
      previousScriptId: scriptId,
    });
  } catch (error) {
    return serverError("story/[scriptId]/regenerate", error);
  }
}
