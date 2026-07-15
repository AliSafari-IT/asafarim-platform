/**
 * Ingest Google-selected media into Vionto storage + the upload session, so the
 * rest of the app treats imported photos exactly like uploaded files.
 *
 * Per item: download full-resolution bytes → validate type/size → store under a
 * user-scoped key → extract EXIF/dimensions → stage in the session. Items are
 * processed with bounded concurrency, deduped by Google media id within the
 * session, and individual failures never fail the whole batch (issue #155).
 */
import { extractDimensions, extractExif } from "../exif";
import { buildKey, putObjectBytes } from "../storage";
import { addAssetToSession, getSessionForUser } from "../upload-session";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "../validation";
import { fetchWithRetry, mapLimit } from "./http";
import type {
  ImportItemResult,
  ImportSummary,
  NormalizedMediaItem,
} from "./types";

const DOWNLOAD_CONCURRENCY = 4;

/** Picker/Library base URLs need a size param; `=d` returns the original. */
function downloadUrl(baseUrl: string): string {
  return baseUrl.includes("=") ? baseUrl : `${baseUrl}=d`;
}

function isSupportedImage(mimeType: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export type ImportOptions = {
  /** Override download concurrency (tests use 1 for determinism). */
  concurrency?: number;
  /** Google OAuth access token — required to download Picker baseUrls. */
  accessToken?: string;
};

/**
 * Download + stage the given media items into `sessionId` (owned by `userId`).
 * Returns a per-item summary. Throws only if the session is missing/expired.
 */
export async function importMediaItems(
  userId: string,
  sessionId: string,
  items: readonly NormalizedMediaItem[],
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const session = getSessionForUser(sessionId, userId);
  if (!session) {
    throw new Error("Invalid or expired upload session");
  }

  // Dedupe against anything already staged in this session, by Google id
  // (stored in the asset's exif/metadata bag) and within this batch.
  const seen = new Set<string>();
  for (const asset of session.assets) {
    const gid = (asset.exif as Record<string, unknown> | undefined)?.googlePhotosId;
    if (typeof gid === "string") seen.add(gid);
  }

  const results = await mapLimit(
    items,
    options.concurrency ?? DOWNLOAD_CONCURRENCY,
    async (item): Promise<ImportItemResult> => {
      if (seen.has(item.googleId)) {
        return {
          googleId: item.googleId,
          status: "skipped",
          reason: "duplicate",
          filename: item.filename,
        };
      }
      seen.add(item.googleId);

      if (!isSupportedImage(item.mimeType)) {
        return {
          googleId: item.googleId,
          status: "skipped",
          reason: "unsupported_type",
          filename: item.filename,
        };
      }

      try {
        const res = await fetchWithRetry(downloadUrl(item.baseUrl), {
          headers: {
            Accept: item.mimeType,
            ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
          },
        });
        if (!res.ok) {
          return {
            googleId: item.googleId,
            status: "failed",
            reason: `download HTTP ${res.status}`,
            filename: item.filename,
          };
        }

        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > MAX_IMAGE_BYTES) {
          return {
            googleId: item.googleId,
            status: "skipped",
            reason: "too_large",
            filename: item.filename,
          };
        }

        const key = buildKey(userId, "sessions", sessionId, item.filename);
        const publicUrl = await putObjectBytes(key, bytes, item.mimeType);

        const dims = extractDimensions(bytes);
        const exif = extractExif(bytes);

        const staged = addAssetToSession(sessionId, {
          key,
          publicUrl,
          filename: item.filename,
          contentType: item.mimeType,
          sizeBytes: bytes.length,
          width: dims?.width ?? item.width,
          height: dims?.height ?? item.height,
          // Tag the source so re-imports dedupe and we keep provenance.
          exif: { ...exif, googlePhotosId: item.googleId, source: "google_photos" },
          uploadedAt: new Date(),
        });
        if (!staged) {
          return {
            googleId: item.googleId,
            status: "failed",
            reason: "session expired during import",
            filename: item.filename,
          };
        }

        return {
          googleId: item.googleId,
          status: "imported",
          key,
          filename: item.filename,
        };
      } catch (error) {
        return {
          googleId: item.googleId,
          status: "failed",
          reason: error instanceof Error ? error.message : "unknown error",
          filename: item.filename,
        };
      }
    },
  );

  return {
    sessionId,
    imported: results.filter((r) => r.status === "imported").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
