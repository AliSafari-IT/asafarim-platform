/**
 * GATED: Library API resolution of a shared album → media items.
 *
 * This path uses the *restricted* Photos Library sharing scopes
 * (`photoslibrary.sharing` + `photoslibrary.readonly.appcreateddata`) which
 * require Google's security assessment. It is only invoked when
 * `GOOGLE_PHOTOS_SHARING_ENABLED=true` (see config). Kept isolated so the
 * default build never depends on the restricted surface.
 */
import { fetchWithRetry, readJson } from "./http";
import type { ParsedSharedAlbum } from "./shared-album";
import { SharedAlbumError } from "./shared-album";
import type { NormalizedMediaItem } from "./types";

export const GOOGLE_PHOTOS_LIBRARY_BASE_FALLBACK =
  "https://photoslibrary.googleapis.com/v1";

type RawLibraryMediaItem = {
  id: string;
  baseUrl: string;
  mimeType: string;
  filename?: string;
  mediaMetadata?: { width?: string; height?: string; creationTime?: string };
};

type RawSearchResponse = {
  mediaItems?: RawLibraryMediaItem[];
  nextPageToken?: string;
};

type RawJoinResponse = { album?: { id?: string } };

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function normalize(raw: RawLibraryMediaItem): NormalizedMediaItem | null {
  if (!raw.baseUrl || !raw.mimeType) return null;
  return {
    googleId: raw.id,
    baseUrl: raw.baseUrl,
    mimeType: raw.mimeType,
    filename: raw.filename ?? `${raw.id}.jpg`,
    width: raw.mediaMetadata?.width ? Number(raw.mediaMetadata.width) : undefined,
    height: raw.mediaMetadata?.height ? Number(raw.mediaMetadata.height) : undefined,
    creationTime: raw.mediaMetadata?.creationTime,
  };
}

/**
 * Join the shared album via its share token, then page through its items.
 * @throws {SharedAlbumError}
 */
export async function resolveViaLibraryApi(
  parsed: ParsedSharedAlbum,
  accessToken: string,
): Promise<NormalizedMediaItem[]> {
  if (!parsed.shareToken) {
    throw new SharedAlbumError(
      "resolve_failed",
      "Could not extract a share token from that link.",
    );
  }

  // 1) Join → resolve the album id from the share token.
  const joinRes = await fetchWithRetry(
    `${GOOGLE_PHOTOS_LIBRARY_BASE_FALLBACK}/sharedAlbums:join`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ shareToken: parsed.shareToken }),
    },
  );
  if (joinRes.status === 403 || joinRes.status === 404) {
    throw new SharedAlbumError(
      "private_or_expired",
      "This album is private, expired, or not accessible to your Google account.",
    );
  }
  const joined = await readJson<RawJoinResponse>(joinRes);
  const albumId = joined.album?.id;
  if (!albumId) {
    throw new SharedAlbumError("resolve_failed", "Album could not be resolved.");
  }

  // 2) Page through the album's media items.
  const items: NormalizedMediaItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetchWithRetry(
      `${GOOGLE_PHOTOS_LIBRARY_BASE_FALLBACK}/mediaItems:search`,
      {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ albumId, pageSize: 100, pageToken }),
      },
    );
    const data = await readJson<RawSearchResponse>(res);
    for (const raw of data.mediaItems ?? []) {
      const n = normalize(raw);
      if (n) items.push(n);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}
