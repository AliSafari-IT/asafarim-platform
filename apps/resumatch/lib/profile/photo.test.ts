import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  cvShowsPhoto,
  photoAltText,
  photoSrc,
  sanitizePhotoJpeg,
} from "./photo";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "../../fixtures/photo", name)));
const ascii = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("sanitizePhotoJpeg", () => {
  it("accepts a square JPEG and strips EXIF (incl. GPS) and comments", () => {
    const input = fixture("square-300-exif.jpg");
    expect(ascii(input)).toContain("Exif");
    expect(ascii(input)).toContain("TestCam");
    expect(ascii(input)).toContain("secret comment");

    const result = sanitizePhotoJpeg(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pixels).toBe(300);
    const out = ascii(result.bytes);
    expect(out).not.toContain("Exif");
    expect(out).not.toContain("TestCam");
    expect(out).not.toContain("secret comment");
    // Still a well-formed JPEG: SOI … EOI, with the JFIF header kept.
    expect([result.bytes[0], result.bytes[1]]).toEqual([0xff, 0xd8]);
    expect([result.bytes.at(-2), result.bytes.at(-1)]).toEqual([0xff, 0xd9]);
    expect(out).toContain("JFIF");
    // Idempotent: sanitizing the output changes nothing.
    const again = sanitizePhotoJpeg(result.bytes);
    expect(
      again.ok && Buffer.from(again.bytes).equals(Buffer.from(result.bytes))
    ).toBe(true);
  });

  it("refuses a file cut off before its first scan", () => {
    const good = fixture("square-300-progressive.jpg");
    const firstScan = Buffer.from(good).indexOf(Buffer.from([0xff, 0xda]));
    expect(firstScan).toBeGreaterThan(0);
    expect(sanitizePhotoJpeg(good.subarray(0, firstScan))).toEqual({
      ok: false,
      reason: "CORRUPT",
    });
  });

  it("strips metadata hidden between the scans of a progressive file, and anything after EOI", () => {
    const good = Buffer.from(fixture("square-300-progressive.jpg"));
    const secondScan = good.indexOf(
      Buffer.from([0xff, 0xda]),
      good.indexOf(Buffer.from([0xff, 0xda])) + 2
    );
    expect(secondScan).toBeGreaterThan(0);
    const payload = Buffer.from("Exif\0\0GPS-SECRET");
    const app1 = Buffer.concat([
      Buffer.from([0xff, 0xe1, 0, payload.length + 2]),
      payload,
    ]);
    const tampered = Buffer.concat([
      good.subarray(0, secondScan),
      app1,
      good.subarray(secondScan),
      Buffer.from("TRAILING-SECRET"),
    ]);

    const result = sanitizePhotoJpeg(new Uint8Array(tampered));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ascii(result.bytes)).not.toContain("GPS-SECRET");
    expect(ascii(result.bytes)).not.toContain("TRAILING-SECRET");
    // Same image data as the untouched file.
    const clean = sanitizePhotoJpeg(new Uint8Array(good));
    expect(
      clean.ok && Buffer.from(clean.bytes).equals(Buffer.from(result.bytes))
    ).toBe(true);
  });

  it("accepts a progressive JPEG", () => {
    expect(
      sanitizePhotoJpeg(fixture("square-300-progressive.jpg"))
    ).toMatchObject({ ok: true, pixels: 300 });
  });

  it("refuses a non-square image", () => {
    expect(sanitizePhotoJpeg(fixture("landscape-400x300.jpg"))).toEqual({
      ok: false,
      reason: "NOT_SQUARE",
    });
  });

  it("refuses an image too small to print sharply", () => {
    expect(sanitizePhotoJpeg(fixture("square-120.jpg"))).toEqual({
      ok: false,
      reason: "BAD_DIMENSIONS",
    });
  });

  it("refuses anything that is not a JPEG, whatever it is called", () => {
    expect(sanitizePhotoJpeg(fixture("square-300.png"))).toEqual({
      ok: false,
      reason: "NOT_JPEG",
    });
    expect(
      sanitizePhotoJpeg(new TextEncoder().encode("<svg onload=alert(1)>"))
    ).toEqual({ ok: false, reason: "NOT_JPEG" });
  });

  it("refuses empty, oversized and truncated files", () => {
    expect(sanitizePhotoJpeg(new Uint8Array())).toEqual({
      ok: false,
      reason: "EMPTY",
    });
    expect(sanitizePhotoJpeg(new Uint8Array(MAX_PHOTO_BYTES + 1))).toEqual({
      ok: false,
      reason: "TOO_LARGE",
    });
    const good = fixture("square-300-exif.jpg");
    expect(sanitizePhotoJpeg(good.subarray(0, good.length - 40))).toEqual({
      ok: false,
      reason: "CORRUPT",
    });
    expect(sanitizePhotoJpeg(good.subarray(0, 300))).toEqual({
      ok: false,
      reason: "CORRUPT",
    });
  });
});

describe("cvShowsPhoto", () => {
  it("follows the CV's own choice, else the profile default, and never shows a missing photo", () => {
    expect(cvShowsPhoto(null, true)).toBe(false);
    expect(cvShowsPhoto({ includeByDefault: true }, null)).toBe(true);
    expect(cvShowsPhoto({ includeByDefault: false }, null)).toBe(false);
    expect(cvShowsPhoto({ includeByDefault: true }, false)).toBe(false);
    expect(cvShowsPhoto({ includeByDefault: false }, true)).toBe(true);
  });
});

describe("photo display helpers", () => {
  it("names the person in the alt text, in the CV's language", () => {
    expect(
      photoAltText("Ali Safari", { photo: "Foto", photoOf: "Foto van" })
    ).toBe("Foto van Ali Safari");
    expect(photoAltText("  ", { photo: "Photo", photoOf: "Photo of" })).toBe(
      "Photo"
    );
  });

  it("points at the app's own route, with a cache-busting version", () => {
    expect(photoSrc("abcdef0123456789ffff")).toBe(
      "/api/profile/photo?v=abcdef012345"
    );
  });
});
