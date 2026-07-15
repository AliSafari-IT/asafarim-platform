import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { formatZodError, uploadCompleteSchema } from "@/lib/server/validation";
import { objectExists, isKeyOwnedBy, getPublicUrlForKey, getObjectBytes } from "@/lib/server/storage";
import { addAssetToSession, getSessionForUser } from "@/lib/server/upload-session";
import { extractExif, extractDimensions } from "@/lib/server/exif";

export const runtime = "nodejs";

/**
 * POST /api/uploads/complete
 *
 * Notify the server that a presigned upload finished. Validates ownership,
 * confirms the object exists in storage, and stages the asset in the upload
 * session. Performs server-side EXIF/dimension extraction (trusted source).
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    console.log("[uploads/complete] Request body:", body);
    const parsed = uploadCompleteSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[uploads/complete] Validation error:", formatZodError(parsed.error));
      return badRequest(formatZodError(parsed.error));
    }

    const { key, sessionId, metadata } = parsed.data;
    console.log("[uploads/complete] Processing upload complete", { key, sessionId, filename: metadata.filename });

    // Ownership check
    if (!isKeyOwnedBy(key, user.id)) {
      return badRequest("Upload key does not belong to the authenticated user");
    }

    // Session ownership check
    const session = getSessionForUser(sessionId, user.id);
    if (!session) {
      return badRequest("Invalid or expired upload session");
    }

    // Confirm object exists in storage (skipped in local-dev stub mode)
    const exists = await objectExists(key);
    if (!exists) {
      return badRequest("Uploaded object not found in storage — upload may have failed");
    }

    // Compute trusted public URL from storage key
    const publicUrl = getPublicUrlForKey(key);

    // Server-side EXIF and dimension extraction (trusted source)
    let width = metadata.width;
    let height = metadata.height;
    let exif = metadata.exif;

    const bytes = await getObjectBytes(key);
    if (bytes) {
      const dims = extractDimensions(bytes);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
      const extractedExif = extractExif(bytes);
      if (Object.keys(extractedExif).length > 0) {
        exif = extractedExif;
      }
    }

    // Stage the asset in the session
    const staged = addAssetToSession(sessionId, {
      key,
      publicUrl,
      filename: metadata.filename,
      contentType: metadata.contentType,
      sizeBytes: metadata.sizeBytes,
      width,
      height,
      exif,
      uploadedAt: new Date(),
    });

    if (!staged) {
      return badRequest("Failed to stage asset — session may have expired");
    }

    return NextResponse.json({
      success: true,
      sessionId,
      asset: staged.assets[staged.assets.length - 1],
      totalAssets: staged.assets.length,
    });
  } catch (error) {
    return serverError("uploads/complete", error);
  }
}
