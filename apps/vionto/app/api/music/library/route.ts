import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { listUserMusic, listCommonMusic } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * GET /api/music/library
 *
 * List audio files available for selection:
 * - User's own uploads (private, under `vionto/{userId}/`)
 * - Common/shared tracks (under `vionto/common/`, available to every user)
 *
 * Returns keys, public URLs, filenames, and metadata so the user can pick an existing
 * track for a Vionto project.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const [userTracks, commonTracks] = await Promise.all([
      listUserMusic(user.id),
      listCommonMusic(),
    ]);

    const tracks = [...commonTracks, ...userTracks];
    return NextResponse.json({ data: tracks, tracks, commonTracks, userTracks });
  } catch (error) {
    return serverError("music/library", error);
  }
}
