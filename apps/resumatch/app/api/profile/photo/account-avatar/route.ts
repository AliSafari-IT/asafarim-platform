import { NextResponse } from "next/server";
import { getObjectBytes } from "@asafarim/storage";
import { loadAccountAvatar } from "../../../../../lib/profile/accountAvatar";
import { getAccountAvatarSource } from "../../../../../lib/profile/accountAvatarSource";
import { logError } from "../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's platform account photo, for the CV photo card to
 * open in its crop editor (lib/profile/accountAvatar.ts). Nothing is
 * stored here: the browser crops it and saves the result through
 * POST /api/profile/photo like any other upload.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const source = await getAccountAvatarSource();
  if (!source)
    return NextResponse.json({ error: "NO_AVATAR" }, { status: 404 });

  try {
    const result = await loadAccountAvatar(source, {
      readObject: getObjectBytes,
      fetch,
    });
    if (!result.ok) {
      const status =
        result.reason === "NOT_FOUND"
          ? 404
          : result.reason === "UNAVAILABLE"
            ? 502
            : 422;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "content-type": result.contentType,
        "content-disposition": "inline",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    logError("profile.photo.account_avatar_failed", error);
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 502 });
  }
}
