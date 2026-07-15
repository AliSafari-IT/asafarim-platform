import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized } from "@/lib/server/auth";
import {
  VOICE_CATALOG,
  listVoicesForLocale,
  listVoicesByTag,
} from "@/lib/server/tts";

export const runtime = "nodejs";

/**
 * GET /api/audio/voices
 *
 * Returns the TTS voice catalog with optional locale and tag filtering.
 */
export async function GET(req: Request) {
  const user = await getAuthedUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale");
  const tag = searchParams.get("tag");

  let voices = VOICE_CATALOG;
  if (locale) {
    voices = listVoicesForLocale(locale);
    if (voices.length === 0) {
      voices = VOICE_CATALOG;
    }
  } else if (tag) {
    voices = listVoicesByTag(tag);
  }

  return NextResponse.json({ voices, total: voices.length });
}
