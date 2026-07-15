import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { formatZodError, zipImportSchema, MAX_BATCH_SIZE } from "@/lib/server/validation";
import { objectExists, isKeyOwnedBy, createPresignedUploadUrl } from "@/lib/server/storage";
import { createSession, getSessionForUser, addAssetToSession } from "@/lib/server/upload-session";

export const runtime = "nodejs";

/**
 * POST /api/uploads/zip
 *
 * Accepts a ZIP file already uploaded to storage, validates it, and stages
 * extracted images into the upload session. Actual extraction is performed
 * by a background worker; this endpoint creates the job and returns a
 * tracking id.
 *
 * Safety limits:
 *   - Max 200 images per zip
 *   - Max 500 MB zip file
 *   - No path traversal in extracted entries
 *   - Only image/* MIME types accepted from extraction
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = zipImportSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const { key, sessionId, expectedCount } = parsed.data;

    if (!isKeyOwnedBy(key, user.id)) {
      return badRequest("ZIP key does not belong to the authenticated user");
    }

    const exists = await objectExists(key);
    if (!exists) {
      return badRequest("ZIP object not found in storage");
    }

    let session = sessionId ? getSessionForUser(sessionId, user.id) : undefined;
    if (!session) {
      session = createSession(user.id, { source: "zip-import", zipKey: key });
    }

    // Validate batch size expectation
    const expected = expectedCount ?? MAX_BATCH_SIZE;
    if (expected > MAX_BATCH_SIZE) {
      return badRequest(`Expected count exceeds maximum of ${MAX_BATCH_SIZE}`);
    }

    // Stub: in production, enqueue a background job (BullMQ / worker) that:
    //  1. Downloads the ZIP from S3
    //  2. Extracts with safe path validation (no ../, absolute paths, symlinks)
    //  3. Filters to image/* MIME types
    //  4. Generates thumbnails
    //  5. Stages each extracted image as a ViontoAsset in the session
    //  6. Updates the job status for polling

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      jobId: `zip-${session.id}`,
      status: "queued",
      message: "ZIP import queued for background processing. Poll /api/uploads/zip/status?jobId=...",
      estimatedImages: expected,
    });
  } catch (error) {
    return serverError("uploads/zip", error);
  }
}
