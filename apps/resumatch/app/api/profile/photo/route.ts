import { NextResponse } from "next/server";
import { logError } from "../../../../lib/observability/logger";
import {
  MAX_PHOTO_BYTES,
  isPhotoShape,
  type PhotoShape,
} from "../../../../lib/profile/photo";
import {
  deleteProfilePhoto,
  describePhoto,
  readProfilePhotoBytes,
  saveProfilePhoto,
  updateProfilePhotoSettings,
} from "../../../../lib/profile/photoStore";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The candidate's own photo, streamed through the app (never a storage
 * link) and only to the workspace that owns it. `private, no-store`: a
 * shared or back-button cache must not keep someone's face.
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const bytes = await readProfilePhotoBytes(workspace.id);
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Upload or replace: one cropped, compressed JPEG in a `photo` form field. */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PHOTO_BYTES * 1.1) {
    return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("photo");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (!file)
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES)
    return NextResponse.json({ error: "TOO_LARGE" }, { status: 413 });

  try {
    const result = await saveProfilePhoto(
      workspace.id,
      new Uint8Array(await file.arrayBuffer())
    );
    if (!result.ok)
      return NextResponse.json({ error: result.reason }, { status: 422 });
    return NextResponse.json({ photo: describePhoto(result.photo) });
  } catch (error) {
    logError("profile.photo.save_failed", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}

/** Change how the photo is used: `{ shape?, includeByDefault? }`. */
export async function PATCH(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: { shape?: unknown; includeByDefault?: unknown };
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const settings: { shape?: PhotoShape; includeByDefault?: boolean } = {};
  if (body.shape !== undefined) {
    if (!isPhotoShape(body.shape))
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    settings.shape = body.shape;
  }
  if (body.includeByDefault !== undefined) {
    if (typeof body.includeByDefault !== "boolean")
      return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
    settings.includeByDefault = body.includeByDefault;
  }
  if (Object.keys(settings).length === 0)
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const updated = await updateProfilePhotoSettings(workspace.id, settings);
  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ photo: describePhoto(updated) });
}

export async function DELETE() {
  const workspace = await getCurrentWorkspace();
  if (!workspace)
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const outcome = await deleteProfilePhoto(workspace.id);
  if (outcome === "missing")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The row is kept when the bytes could not be confirmed gone, so the
  // candidate sees the photo is still there and can try again.
  if (outcome === "failed")
    return NextResponse.json({ error: "DELETE_FAILED" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
