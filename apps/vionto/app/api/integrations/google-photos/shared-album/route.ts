import { NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { touchGooglePhotosImportedAt } from "@/lib/server/google-photos/connection";
import { importMediaItems } from "@/lib/server/google-photos/ingest";
import { authErrorResponse } from "@/lib/server/google-photos/route-helpers";
import {
  SharedAlbumError,
  resolveSharedAlbum,
} from "@/lib/server/google-photos/shared-album";
import { getValidGooglePhotosAccessToken } from "@/lib/server/google-photos/tokens";
import { getSessionForUser } from "@/lib/server/upload-session";

export const runtime = "nodejs";

const schema = z.object({
  url: z.string().min(1),
  uploadSessionId: z.string().min(1),
});

/**
 * POST /api/integrations/google-photos/shared-album
 *
 * Import media from a shared Google Photos album link into the upload session.
 * When direct sharing access is not enabled, returns a `fallback` response
 * telling the client to use the picker instead (see docs §4).
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Invalid request");
    const { url, uploadSessionId } = parsed.data;

    if (!getSessionForUser(uploadSessionId, user.id)) {
      return badRequest("Invalid or expired upload session");
    }

    const accessToken = await getValidGooglePhotosAccessToken(user.id);

    let resolution;
    try {
      resolution = await resolveSharedAlbum(url, accessToken);
    } catch (error) {
      if (error instanceof SharedAlbumError) {
        const status = error.code === "private_or_expired" ? 404 : 400;
        return NextResponse.json({ error: error.code, message: error.message }, { status });
      }
      throw error;
    }

    if (resolution.mode === "fallback") {
      return NextResponse.json({
        mode: "fallback",
        reason: resolution.reason,
        message:
          "Direct shared-album import isn't enabled. Open the album in Google Photos and use \"Import from Google Photos\" to pick the photos.",
      });
    }

    if (resolution.items.length === 0) {
      return badRequest("No photos found in that album");
    }

    const summary = await importMediaItems(user.id, uploadSessionId, resolution.items);
    if (summary.imported > 0) {
      await touchGooglePhotosImportedAt(user.id).catch(() => {});
    }

    return NextResponse.json({ mode: "items", ...summary });
  } catch (error) {
    return authErrorResponse(error) ?? serverError("google-photos/shared-album", error);
  }
}
