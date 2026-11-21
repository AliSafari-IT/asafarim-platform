/**
 * "Use my account photo" for the CV photo.
 *
 * The platform account's avatar is the session's `user.image`: either a
 * photo uploaded in Hub (an object under `hub/avatars/<first 8 chars of the
 * user id>/` in the platform's shared storage) or, for a Google sign-in,
 * the Google profile picture. Hub's profile API also accepts any string up
 * to 1000 characters as `image`, so the value is treated as untrusted:
 *
 * - A Hub upload is read straight from storage by key. Nothing is fetched
 *   over HTTP, and the key must sit under *this* user's avatar prefix.
 * - A Google picture is fetched only from `lh<n>.googleusercontent.com`,
 *   over HTTPS on the default port, without following redirects, with a
 *   timeout and a byte cap. Anything else is refused: no server-side fetch
 *   of an arbitrary URL (SSRF).
 *
 * The bytes go to the candidate's own browser only, which opens them in the
 * same crop editor as a file from the device. What gets stored is the same
 * cropped, re-encoded 600 × 600 JPEG that an upload produces, checked and
 * stripped by the same server code — so the PDF and Word exports cannot
 * tell the two apart.
 */

/** Hub caps avatars at 2 MB; a Google picture at 800 px is far smaller. */
export const MAX_ACCOUNT_AVATAR_BYTES = 5 * 1024 * 1024;
export const ACCOUNT_AVATAR_TIMEOUT_MS = 5000;
/** Google serves profile pictures at any size; ask for one big enough to
 *  crop (the default `=s96-c` is under the 200 px minimum). */
export const GOOGLE_AVATAR_PIXELS = 800;

const HUB_AVATAR_PREFIX = "hub/avatars";
const GOOGLE_HOST = /^lh[0-9]\.googleusercontent\.com$/;

export type AccountAvatarSource =
  | { kind: "storage"; key: string }
  | { kind: "google"; url: string };

export type AvatarImageType = "image/jpeg" | "image/png" | "image/webp";

/** The opener of the file, never its declared type. SVG (script) and GIF
 *  (animation) are refused: a CV photo is a still raster image. */
export function sniffAvatarType(bytes: Uint8Array): AvatarImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Ask Google for a larger rendition: `…=s96-c` → `…=s800-c`. */
export function googleAvatarAtSize(url: URL, pixels = GOOGLE_AVATAR_PIXELS): string {
  const next = new URL(url.toString());
  const sized = `=s${pixels}-c`;
  if (/=[^/]*$/.test(next.pathname)) {
    next.pathname = next.pathname.replace(/=[^/]*$/, sized);
  } else {
    next.pathname = `${next.pathname}${sized}`;
  }
  next.search = "";
  next.hash = "";
  return next.toString();
}

/**
 * Where the account photo can be read from, or null when it is missing or
 * not a source this app reads.
 *
 * @param storagePublicPrefix what the platform storage puts in front of a
 *   key in a public URL (`getPublicUrlForKey("")`): the bucket's public
 *   base URL in production, `/api/storage/local?key=` in local mode.
 */
export function resolveAccountAvatar(
  image: string | null | undefined,
  platformUserId: string,
  storagePublicPrefix: string
): AccountAvatarSource | null {
  const value = image?.trim();
  if (!value || value.length > 1000 || !platformUserId) return null;

  if (storagePublicPrefix && value.startsWith(storagePublicPrefix)) {
    let key: string;
    try {
      key = decodeURIComponent(value.slice(storagePublicPrefix.length).split(/[?#]/)[0]);
    } catch {
      return null;
    }
    // Exactly what Hub's buildKey writes for this user: no other folder,
    // no traversal, no other user's avatar.
    const owner = platformUserId.slice(0, 8).replace(/[^A-Za-z0-9_-]/g, "");
    const expected = new RegExp(
      `^${HUB_AVATAR_PREFIX}/${owner}/[A-Za-z0-9-]+\\.(?:jpg|jpeg|png|webp)$`
    );
    return owner && expected.test(key) ? { kind: "storage", key } : null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol === "https:" &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    GOOGLE_HOST.test(url.hostname)
  ) {
    return { kind: "google", url: googleAvatarAtSize(url) };
  }
  return null;
}

export type AccountAvatarLoad =
  | { ok: true; bytes: Uint8Array; contentType: AvatarImageType }
  | { ok: false; reason: "NOT_FOUND" | "UNSUPPORTED" | "TOO_LARGE" | "UNAVAILABLE" };

export interface AccountAvatarDeps {
  readObject: (key: string) => Promise<{ body: Uint8Array } | null>;
  fetch: typeof fetch;
}

async function readCapped(response: Response, cap: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > cap) return null;
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Read the account photo's bytes from its source and check what they are. */
export async function loadAccountAvatar(
  source: AccountAvatarSource,
  deps: AccountAvatarDeps
): Promise<AccountAvatarLoad> {
  let bytes: Uint8Array;
  if (source.kind === "storage") {
    const object = await deps.readObject(source.key).catch(() => null);
    if (!object) return { ok: false, reason: "NOT_FOUND" };
    bytes = object.body;
  } else {
    let response: Response;
    try {
      response = await deps.fetch(source.url, {
        redirect: "error",
        signal: AbortSignal.timeout(ACCOUNT_AVATAR_TIMEOUT_MS),
        headers: { accept: "image/jpeg,image/png,image/webp" },
        cache: "no-store",
      });
    } catch {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    if (response.status === 404) return { ok: false, reason: "NOT_FOUND" };
    if (!response.ok) return { ok: false, reason: "UNAVAILABLE" };
    let read: Uint8Array | null;
    try {
      read = await readCapped(response, MAX_ACCOUNT_AVATAR_BYTES);
    } catch {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    if (!read) return { ok: false, reason: "TOO_LARGE" };
    bytes = read;
  }

  if (bytes.length > MAX_ACCOUNT_AVATAR_BYTES) return { ok: false, reason: "TOO_LARGE" };
  const contentType = sniffAvatarType(bytes);
  if (!contentType) return { ok: false, reason: "UNSUPPORTED" };
  return { ok: true, bytes, contentType };
}
