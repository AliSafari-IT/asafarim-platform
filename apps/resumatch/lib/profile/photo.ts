/**
 * Optional CV photo: the contract shared by the upload route, the profile
 * panel, the CV template and the DOCX export.
 *
 * The photo is deliberately NOT part of `CandidateProfileContent`. Profile
 * content is versioned, re-parsed on every read and turned into prompt
 * text; a photo is none of those. It lives in its own row
 * (`ProfilePhoto`) and its own private object, is never read by the
 * tailoring or cover-letter code, and is only ever joined in at render
 * time — so no model ever sees it, and nothing a model returns can change
 * it.
 *
 * **What the server accepts.** The browser does the cropping and
 * compressing (`app/profile/PhotoPanel.tsx`): any image it can decode is
 * drawn onto a square canvas and re-encoded as a baseline JPEG. The server
 * trusts none of that. It accepts only a JPEG it can parse, square, between
 * `MIN_PHOTO_PIXELS` and `MAX_PHOTO_PIXELS` on a side and under
 * `MAX_PHOTO_BYTES`, and it rewrites the file without its metadata
 * segments (EXIF — which can carry GPS coordinates and the camera's serial
 * number — XMP, ICC, comments) before storing it.
 */

/** Ceiling for the cropped, compressed upload. The panel's 600 × 600 JPEG
 *  is typically 40–150 KB; this leaves room without inviting raw photos. */
export const MAX_PHOTO_BYTES = 1024 * 1024;
/** What the panel will open before cropping. Checked in the browser only:
 *  the original never leaves the device. */
export const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;
/** Side of the square the panel produces. */
export const PHOTO_OUTPUT_PIXELS = 600;
export const MIN_PHOTO_PIXELS = 200;
export const MAX_PHOTO_PIXELS = 1200;

export const PHOTO_SHAPES = ["circle", "square"] as const;
export type PhotoShape = (typeof PHOTO_SHAPES)[number];

export function isPhotoShape(value: unknown): value is PhotoShape {
  return (
    typeof value === "string" &&
    (PHOTO_SHAPES as readonly string[]).includes(value)
  );
}

export type PhotoRejection =
  | "NOT_JPEG"
  | "TOO_LARGE"
  | "EMPTY"
  | "NOT_SQUARE"
  | "BAD_DIMENSIONS"
  | "CORRUPT";

export type SanitizedPhoto =
  | { ok: true; bytes: Uint8Array; pixels: number }
  | { ok: false; reason: PhotoRejection };

// Markers with no length field.
const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
/** Start-of-frame markers for the Huffman-coded JPEG variants browsers
 *  write (baseline, extended, progressive). Arithmetic and lossless
 *  variants are refused: a canvas never produces them. */
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2]);
/** Everything else that starts a frame — refused rather than misread. */
const OTHER_SOF_MARKERS = new Set([
  0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function isDroppedMetadata(marker: number): boolean {
  // APP1–APP15 (EXIF, XMP, ICC, Photoshop IRB, …) and COM. APP0 (JFIF)
  // only says "this is a JFIF file" and its pixel density, so it stays.
  return (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
}

/**
 * Validate a JPEG and return a copy without its metadata segments.
 *
 * Walks the marker segments up to Start-of-Scan, keeping only the ones a
 * decoder needs; the entropy-coded data after SOS (which, for a
 * progressive file, contains further tables and scans) is copied through
 * unchanged. Nothing here decodes pixels.
 */
export function sanitizePhotoJpeg(input: Uint8Array): SanitizedPhoto {
  if (input.length === 0) return { ok: false, reason: "EMPTY" };
  if (input.length > MAX_PHOTO_BYTES) return { ok: false, reason: "TOO_LARGE" };
  if (
    input.length < 4 ||
    input[0] !== 0xff ||
    input[1] !== SOI ||
    input[2] !== 0xff
  ) {
    return { ok: false, reason: "NOT_JPEG" };
  }

  const kept: Uint8Array[] = [input.subarray(0, 2)];
  let offset = 2;
  let width = 0;
  let height = 0;

  while (offset < input.length) {
    if (input[offset] !== 0xff) return { ok: false, reason: "CORRUPT" };
    // Fill bytes (0xFF 0xFF …) may pad between segments.
    let markerAt = offset + 1;
    while (markerAt < input.length && input[markerAt] === 0xff) markerAt += 1;
    if (markerAt >= input.length) return { ok: false, reason: "CORRUPT" };
    const marker = input[markerAt]!;
    const segmentStart = markerAt + 1;

    if (marker === EOI) return { ok: false, reason: "CORRUPT" }; // no image data
    if (segmentStart + 2 > input.length)
      return { ok: false, reason: "CORRUPT" };
    const length = (input[segmentStart]! << 8) | input[segmentStart + 1]!;
    if (length < 2 || segmentStart + length > input.length)
      return { ok: false, reason: "CORRUPT" };
    const segmentEnd = segmentStart + length;

    if (OTHER_SOF_MARKERS.has(marker)) return { ok: false, reason: "NOT_JPEG" };
    if (SOF_MARKERS.has(marker)) {
      if (length < 8) return { ok: false, reason: "CORRUPT" };
      height = (input[segmentStart + 3]! << 8) | input[segmentStart + 4]!;
      width = (input[segmentStart + 5]! << 8) | input[segmentStart + 6]!;
    }

    if (marker === SOS) {
      if (width === 0 || height === 0) return { ok: false, reason: "CORRUPT" };
      // The rest of the file: this scan header, entropy data, any later
      // tables/scans, and EOI. Must end with EOI or it was truncated.
      const rest = input.subarray(offset);
      const last = input.length;
      if (input[last - 2] !== 0xff || input[last - 1] !== EOI)
        return { ok: false, reason: "CORRUPT" };
      kept.push(rest);
      break;
    }

    if (!isDroppedMetadata(marker))
      kept.push(input.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }

  if (width === 0 || height === 0) return { ok: false, reason: "CORRUPT" };
  if (width !== height) return { ok: false, reason: "NOT_SQUARE" };
  if (width < MIN_PHOTO_PIXELS || width > MAX_PHOTO_PIXELS)
    return { ok: false, reason: "BAD_DIMENSIONS" };

  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of kept) {
    bytes.set(part, at);
    at += part.length;
  }
  return { ok: true, bytes, pixels: width };
}

/** What a CV render needs to show the photo. `src` is the app's own
 *  authenticated route, never a storage URL. */
export interface CvPhoto {
  src: string;
  shape: PhotoShape;
}

/** Whether a CV shows the photo: its own choice when it has one, else the
 *  profile default. No photo, nothing to show. */
export function cvShowsPhoto(
  photo: { includeByDefault: boolean } | null | undefined,
  cvChoice: boolean | null | undefined
): boolean {
  if (!photo) return false;
  return cvChoice ?? photo.includeByDefault;
}

/** Same-origin URL for the photo. The content hash busts the browser cache
 *  when the photo is replaced. */
export function photoSrc(contentHash: string): string {
  return `/api/profile/photo?v=${contentHash.slice(0, 12)}`;
}

/** Accessible name for the photo on a CV, in the CV's language. */
export function photoAltText(
  fullName: string | null | undefined,
  labels: { photo: string; photoOf: string }
): string {
  const name = fullName?.trim();
  return name ? `${labels.photoOf} ${name}` : labels.photo;
}
