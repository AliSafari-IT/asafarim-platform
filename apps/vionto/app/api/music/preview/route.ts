import { NextResponse } from "next/server";

import {
  badRequest,
  getAuthedUser,
  serverError,
  unauthorized,
} from "@/lib/server/auth";
import { createPresignedDownloadUrl, isKeyOwnedBy } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const key = new URL(req.url).searchParams.get("key")?.trim();
    if (!key) return badRequest("Music key is required");

    const isCommonTrack = key.startsWith("vionto/common/audio/");
    if (!isCommonTrack && !isKeyOwnedBy(key, user.id)) {
      return NextResponse.json(
        { error: "Music track not found" },
        { status: 404 }
      );
    }

    const previewUrl = await createPresignedDownloadUrl(key, 10 * 60);
    return NextResponse.json({ previewUrl });
  } catch (error) {
    return serverError("music/preview", error);
  }
}
