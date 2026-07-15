/**
 * Shared Google Photos album link handling.
 *
 * Direct URL → enumerate-items import requires the restricted Library API
 * sharing scope and Google's security assessment. Until that approval lands
 * (`GOOGLE_PHOTOS_SHARING_ENABLED=true`), we validate/parse the link and return
 * a structured "use the picker instead" fallback. See docs §4.
 */
import { GOOGLE_PHOTOS_LIBRARY_BASE_FALLBACK, resolveViaLibraryApi } from "./shared-album-library";
import { isSharedAlbumImportEnabled } from "./config";
import type { NormalizedMediaItem } from "./types";

export type ParsedSharedAlbum = {
  /** The share token / album reference extracted from the URL, if any. */
  shareToken: string | null;
  normalizedUrl: string;
};

const SHARED_HOST_PATTERN = /(^|\.)photos\.(app\.goo\.gl|google\.com)$/i;

/**
 * Validate that a string is a plausible Google Photos shared-album link and
 * extract its share token. Throws on clearly invalid input.
 *
 * Accepted shapes:
 *   https://photos.app.goo.gl/<token>
 *   https://photos.google.com/share/<token>?key=...
 */
export function parseSharedAlbumUrl(input: string): ParsedSharedAlbum {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SharedAlbumError("invalid_url", "That doesn't look like a valid URL.");
  }

  if (url.protocol !== "https:" || !SHARED_HOST_PATTERN.test(url.hostname)) {
    throw new SharedAlbumError(
      "invalid_url",
      "Enter a Google Photos shared album link (photos.app.goo.gl/… or photos.google.com/share/…).",
    );
  }

  let shareToken: string | null = null;
  if (url.hostname.endsWith("goo.gl")) {
    // Short link: /<token>
    shareToken = url.pathname.replace(/^\/+/, "").split("/")[0] || null;
  } else {
    // photos.google.com/share/<token>
    const parts = url.pathname.split("/").filter(Boolean);
    const shareIdx = parts.indexOf("share");
    if (shareIdx >= 0 && parts[shareIdx + 1]) shareToken = parts[shareIdx + 1];
  }

  return { shareToken, normalizedUrl: url.toString() };
}

export type SharedAlbumErrorCode =
  | "invalid_url"
  | "not_enabled"
  | "private_or_expired"
  | "resolve_failed";

export class SharedAlbumError extends Error {
  readonly code: SharedAlbumErrorCode;
  constructor(code: SharedAlbumErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SharedAlbumError";
    this.code = code;
  }
}

export type SharedAlbumResolution =
  | { mode: "items"; items: NormalizedMediaItem[] }
  | { mode: "fallback"; reason: "not_enabled"; parsed: ParsedSharedAlbum };

/**
 * Resolve a shared-album link to its media items, or signal the picker
 * fallback when restricted sharing access is not enabled.
 */
export async function resolveSharedAlbum(
  input: string,
  accessToken: string,
): Promise<SharedAlbumResolution> {
  const parsed = parseSharedAlbumUrl(input);

  if (!isSharedAlbumImportEnabled()) {
    return { mode: "fallback", reason: "not_enabled", parsed };
  }

  // Restricted path (only reached when explicitly enabled + verified).
  void GOOGLE_PHOTOS_LIBRARY_BASE_FALLBACK;
  const items = await resolveViaLibraryApi(parsed, accessToken);
  return { mode: "items", items };
}
