/**
 * Lightweight EXIF extraction for JPEG and PNG images.
 *
 * Uses native Node.js Buffer parsing for common JPEG EXIF (no external deps).
 * For HEIC/HEIF and TIFF, a production build should swap this for `exifreader`
 * or `sharp` metadata. This module gracefully handles missing metadata.
 */

import { prisma } from "@asafarim/db";

export type ExifData = {
  timestamp?: string;
  orientation?: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
  cameraMake?: string;
  cameraModel?: string;
  dimensions?: { width: number; height: number };
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  focalLength?: number;
  [key: string]: unknown;
};

/**
 * Parse EXIF from a JPEG or PNG buffer.
 * Returns empty object if no EXIF segment is found.
 */
export function extractExif(buffer: Buffer): ExifData {
  try {
    if (isJpeg(buffer)) {
      return parseJpegExif(buffer);
    }
    if (isPng(buffer)) {
      return parsePngDimensions(buffer);
    }
    return {};
  } catch {
    // Graceful fallback: images without metadata shouldn't break processing
    return {};
  }
}

/** Extract just dimensions from any image buffer (header-only, fast). */
export function extractDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  try {
    if (isJpeg(buffer)) {
      const dims = parseJpegDimensions(buffer);
      if (dims) return dims;
    }
    if (isPng(buffer)) {
      return parsePngDimensions(buffer).dimensions;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
}

// ─── PNG ─────────────────────────────────────────────────────

function parsePngDimensions(buf: Buffer): ExifData {
  const result: ExifData = {};
  let offset = 16; // skip PNG signature (8) + IHDR length (4) + "IHDR" (4)
  if (buf.length >= offset + 8) {
    const width = buf.readUInt32BE(offset);
    const height = buf.readUInt32BE(offset + 4);
    result.dimensions = { width, height };
  }
  return result;
}

// ─── JPEG ────────────────────────────────────────────────────

function parseJpegDimensions(buf: Buffer): { width: number; height: number } | undefined {
  let offset = 2; // skip SOI
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // SOF0, SOF1, SOF2
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return undefined;
}

function parseJpegExif(buf: Buffer): ExifData {
  const result: ExifData = {};
  const dims = parseJpegDimensions(buf);
  if (dims) result.dimensions = dims;

  // Find APP1 (EXIF) segment: 0xff 0xe1
  let offset = 2;
  while (offset < buf.length - 3) {
    if (buf[offset] === 0xff && buf[offset + 1] === 0xe1) {
      const length = buf.readUInt16BE(offset + 2);
      const exifOffset = offset + 4;
      if (buf.length >= exifOffset + 6) {
        const exifData = parseExifSegment(buf, exifOffset, length - 2);
        Object.assign(result, exifData);
      }
      break; // first APP1 is enough for most images
    }
    if (buf[offset] === 0xff && buf[offset + 1] === 0xd9) break;
    offset++;
  }
  return result;
}

function parseExifSegment(buf: Buffer, start: number, length: number): ExifData {
  const result: ExifData = {};
  const header = buf.toString("ascii", start, start + 6);
  if (header !== "Exif\x00\x00") return result;

  const tiffStart = start + 6;
  if (buf.length < tiffStart + 8) return result;

  const littleEndian = buf[tiffStart] === 0x49 && buf[tiffStart + 1] === 0x49;
  const readUInt16 = littleEndian
    ? (o: number) => buf.readUInt16LE(o)
    : (o: number) => buf.readUInt16BE(o);
  const readUInt32 = littleEndian
    ? (o: number) => buf.readUInt32LE(o)
    : (o: number) => buf.readUInt32BE(o);

  const ifdOffset = readUInt32(tiffStart + 4);
  let ifd = tiffStart + ifdOffset;

  try {
    const count = readUInt16(ifd);
    ifd += 2;
    for (let i = 0; i < count && ifd + 12 <= buf.length; i++) {
      const tag = readUInt16(ifd);
      const type = readUInt16(ifd + 2);
      // const numValues = readUInt32(ifd + 4);
      const valueOffset = readUInt32(ifd + 8);

      switch (tag) {
        case 0x010f: // Make
          result.cameraMake = readString(buf, ifd + 8, type, 4, littleEndian);
          break;
        case 0x0110: // Model
          result.cameraModel = readString(buf, ifd + 8, type, 4, littleEndian);
          break;
        case 0x0112: // Orientation
          result.orientation = readUInt16(ifd + 8);
          break;
        case 0x8827: // ISO
          result.iso = readUInt16(ifd + 8);
          break;
        case 0x829d: // FNumber (aperture)
          result.aperture = readRational(buf, ifd + 8, tiffStart, littleEndian);
          break;
        case 0x920a: // FocalLength
          result.focalLength = readRational(buf, ifd + 8, tiffStart, littleEndian);
          break;
        case 0x829a: // ExposureTime
          result.shutterSpeed = formatShutterSpeed(readRational(buf, ifd + 8, tiffStart, littleEndian));
          break;
        case 0x9003: // DateTimeOriginal
          result.timestamp = readString(buf, ifd + 8, type, 4, littleEndian)?.replace(/:/g, "-").slice(0, 10);
          break;
        case 0x9201: // ShutterSpeedValue
          if (!result.shutterSpeed) {
            const val = readRational(buf, ifd + 8, tiffStart, littleEndian);
            if (val) result.shutterSpeed = formatShutterSpeed(Math.pow(2, -val));
          }
          break;
      }
      ifd += 12;
    }
  } catch {
    // partial EXIF is fine
  }

  return result;
}

function readString(buf: Buffer, offset: number, type: number, inlineBytes: number, littleEndian: boolean): string | undefined {
  const isInline = inlineBytes >= 4;
  if (isInline) {
    const len = type === 2 ? Math.min(4, buf[offset + 3] || 4) : 4;
    return buf.toString("ascii", offset, offset + len).replace(/\x00/g, "").trim() || undefined;
  }
  // For offsets > 4 bytes, we'd need to read from the offset — simplified here
  return undefined;
}

function readRational(buf: Buffer, offset: number, tiffStart: number, littleEndian: boolean): number | undefined {
  try {
    const readUInt32 = littleEndian
      ? (o: number) => buf.readUInt32LE(o)
      : (o: number) => buf.readUInt32BE(o);
    const num = readUInt32(offset);
    const den = readUInt32(offset + 4);
    return den === 0 ? undefined : num / den;
  } catch {
    return undefined;
  }
}

function formatShutterSpeed(seconds: number | undefined): string | undefined {
  if (seconds === undefined || seconds <= 0) return undefined;
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10}s`;
  const denom = Math.round(1 / seconds);
  return `1/${denom}s`;
}

/**
 * Summary of EXIF data aggregated from multiple project assets.
 */
export type ExifSummary = {
  imageCount: number;
  dateRange?: { start: string; end: string };
  locations?: { latitude: number; longitude: number; count: number }[];
  cameraHints?: {
    makes: string[];
    models: string[];
    orientations: number[];
  };
  aspectRatioHints?: string[];
  totalSizeBytes?: number;
};

export function getAssetExif(metadata: unknown): ExifData | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const exif = record.exif && typeof record.exif === "object" ? record.exif : record;
  return exif as ExifData;
}

/**
 * Build an EXIF summary from project assets for story generation context.
 * Aggregates date ranges, locations, camera info, and image count.
 */
export async function buildExifSummary(projectId: string): Promise<ExifSummary> {
  const assets = await prisma.viontoAsset.findMany({
    where: { projectId, type: "source_image" },
    select: {
      metadata: true,
      width: true,
      height: true,
      fileSizeBytes: true,
      createdAt: true,
    },
    orderBy: { orderIndex: "asc" },
  });

  const summary: ExifSummary = {
    imageCount: assets.length,
  };

  if (assets.length === 0) return summary;

  const timestamps: string[] = [];
  const locations: Map<string, { latitude: number; longitude: number; count: number }> = new Map();
  const makes = new Set<string>();
  const models = new Set<string>();
  const orientations = new Set<number>();
  const aspectRatios = new Set<string>();
  let totalSizeBytes = 0;

  for (const asset of assets) {
    const exif = getAssetExif(asset.metadata);

    // Timestamps for date range
    if (exif?.timestamp) {
      timestamps.push(exif.timestamp);
    } else {
      timestamps.push(asset.createdAt.toISOString().split("T")[0]);
    }

    // GPS locations
    if (exif?.gpsLatitude && exif?.gpsLongitude) {
      const key = `${exif.gpsLatitude.toFixed(4)},${exif.gpsLongitude.toFixed(4)}`;
      const existing = locations.get(key);
      if (existing) {
        existing.count++;
      } else {
        locations.set(key, { latitude: exif.gpsLatitude, longitude: exif.gpsLongitude, count: 1 });
      }
    }

    // Camera info
    if (exif?.cameraMake) makes.add(exif.cameraMake);
    if (exif?.cameraModel) models.add(exif.cameraModel);
    if (exif?.orientation) orientations.add(exif.orientation);

    // Aspect ratio hints
    if (asset.width && asset.height) {
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(asset.width, asset.height);
      const ratio = `${asset.width / divisor}:${asset.height / divisor}`;
      aspectRatios.add(ratio);
    }

    // Total size
    if (asset.fileSizeBytes) totalSizeBytes += asset.fileSizeBytes;
  }

  // Date range
  if (timestamps.length > 0) {
    const sorted = timestamps.sort();
    summary.dateRange = {
      start: sorted[0],
      end: sorted[sorted.length - 1],
    };
  }

  // Locations
  if (locations.size > 0) {
    summary.locations = Array.from(locations.values()).sort((a, b) => b.count - a.count);
  }

  // Camera hints
  if (makes.size > 0 || models.size > 0 || orientations.size > 0) {
    summary.cameraHints = {
      makes: Array.from(makes),
      models: Array.from(models),
      orientations: Array.from(orientations),
    };
  }

  // Aspect ratio hints
  if (aspectRatios.size > 0) {
    summary.aspectRatioHints = Array.from(aspectRatios);
  }

  // Total size
  if (totalSizeBytes > 0) {
    summary.totalSizeBytes = totalSizeBytes;
  }

  return summary;
}

/**
 * Format EXIF summary as a text description for LLM prompt context.
 */
export function formatExifSummaryForPrompt(summary: ExifSummary, locale: string = "en"): string {
  const parts: string[] = [];

  parts.push(locale === "en" ? `${summary.imageCount} images` : `${summary.imageCount} imágenes`);

  if (summary.dateRange) {
    const start = summary.dateRange.start;
    const end = summary.dateRange.end;
    if (start === end) {
      parts.push(locale === "en" ? `from ${start}` : `del ${start}`);
    } else {
      parts.push(locale === "en" ? `from ${start} to ${end}` : `del ${start} al ${end}`);
    }
  }

  if (summary.locations && summary.locations.length > 0) {
    parts.push(locale === "en"
      ? `with ${summary.locations.length} distinct location(s)`
      : `con ${summary.locations.length} ubicación(es) distinta(s)`);
  }

  if (summary.cameraHints && summary.cameraHints.makes.length > 0) {
    parts.push(locale === "en"
      ? `captured with ${summary.cameraHints.makes.join(", ")}`
      : `capturadas con ${summary.cameraHints.makes.join(", ")}`);
  }

  if (summary.aspectRatioHints && summary.aspectRatioHints.length > 0) {
    const dominantRatio = summary.aspectRatioHints[0];
    parts.push(locale === "en"
      ? `primarily ${dominantRatio} aspect ratio`
      : `principalmente en formato ${dominantRatio}`);
  }

  return parts.join(", ") + ".";
}
