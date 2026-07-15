import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { synthesizeSpeech } from "@/lib/server/tts";

export const runtime = "nodejs";

const MAX_PREVIEW_LENGTH = 200;

/**
 * POST /api/audio/preview
 *
 * Generates a short TTS audio preview for voice selection UI.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    let body: { text?: string; voiceId?: string; provider?: "openai" | "elevenlabs" };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const text = body.text?.trim() ?? "";
    if (!text || text.length > MAX_PREVIEW_LENGTH) {
      return badRequest(`Preview text is required and must be <= ${MAX_PREVIEW_LENGTH} characters.`);
    }
    if (!body.voiceId) {
      return badRequest("voiceId is required.");
    }

    const result = await synthesizeSpeech(
      text,
      body.voiceId,
      body.provider ? [body.provider] : undefined
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error, provider: result.provider }, { status: 502 });
    }

    // Return as base64 for easy playback in UI
    return NextResponse.json({
      audioBase64: result.audioBuffer.toString("base64"),
      provider: result.provider,
      voiceId: result.voiceId,
      latencyMs: result.latencyMs,
      durationSeconds: result.durationSeconds,
    });
  } catch (error) {
    return serverError("audio/preview", error);
  }
}
