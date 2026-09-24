/**
 * Tests for image scoring module.
 */

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { detectBlur, calculatePerceptualHash, compareHashes, analyzeCaptionForFeatures, scoreMetadata } from "../image-scoring";

/** 16x16 PNG that is white on one half and black on the other. */
function halfImage(whiteSide: "left" | "right"): Promise<Buffer> {
  const size = 16;
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isLeft = x < size / 2;
      pixels[y * size + x] = isLeft === (whiteSide === "left") ? 255 : 0;
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
}

describe("image-scoring", () => {
  describe("detectBlur", () => {
    it("should handle empty buffer gracefully", async () => {
      const buffer = Buffer.alloc(0);
      const score = await detectBlur(buffer);
      expect(score).toBe(50); // Default score on error
    });

    it("should handle invalid image data", async () => {
      const buffer = Buffer.from("not an image");
      const score = await detectBlur(buffer);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("calculatePerceptualHash", () => {
    it("should handle empty buffer gracefully", async () => {
      const buffer = Buffer.alloc(0);
      const hash = await calculatePerceptualHash(buffer);
      expect(hash).toBe("");
    });

    it("should return consistent hash for same buffer", async () => {
      const buffer = await halfImage("left");
      const hash1 = await calculatePerceptualHash(buffer);
      const hash2 = await calculatePerceptualHash(buffer);
      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different buffers", async () => {
      const hash1 = await calculatePerceptualHash(await halfImage("left"));
      const hash2 = await calculatePerceptualHash(await halfImage("right"));
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("compareHashes", () => {
    it("should return 100 for identical hashes", () => {
      const hash1 = "11111111";
      const hash2 = "11111111";
      const similarity = compareHashes(hash1, hash2);
      expect(similarity).toBe(100);
    });

    it("should return 0 for completely different hashes", () => {
      const hash1 = "11111111";
      const hash2 = "00000000";
      const similarity = compareHashes(hash1, hash2);
      expect(similarity).toBe(0);
    });

    it("should return 50 for half-matching hashes", () => {
      const hash1 = "11110000";
      const hash2 = "11001100";
      const similarity = compareHashes(hash1, hash2);
      expect(similarity).toBe(50);
    });

    it("should handle empty hashes", () => {
      expect(compareHashes("", "")).toBe(0);
      expect(compareHashes("11111111", "")).toBe(0);
      expect(compareHashes("", "11111111")).toBe(0);
    });
  });

  describe("analyzeCaptionForFeatures", () => {
    it("should detect face-related keywords", () => {
      const caption = "A photo of people at a family gathering with children smiling";
      const features = analyzeCaptionForFeatures(caption);
      expect(features.faces).toBeGreaterThan(0);
    });

    it("should detect landmark-related keywords", () => {
      const caption = "Beautiful landscape with mountains and a scenic beach view";
      const features = analyzeCaptionForFeatures(caption);
      expect(features.landmarks).toBeGreaterThan(0);
    });

    it("should detect both faces and landmarks", () => {
      const caption = "People standing in front of the Eiffel Tower in Paris";
      const features = analyzeCaptionForFeatures(caption);
      expect(features.faces).toBeGreaterThan(0);
      expect(features.landmarks).toBeGreaterThan(0);
    });

    it("should return zero for empty caption", () => {
      const features = analyzeCaptionForFeatures("");
      expect(features.faces).toBe(0);
      expect(features.landmarks).toBe(0);
    });
  });

  describe("scoreMetadata", () => {
    it("should score complete EXIF data highly", () => {
      const metadata = {
        timestamp: "2023-01-01",
        gpsLatitude: 48.8566,
        gpsLongitude: 2.3522,
        cameraMake: "Canon",
        cameraModel: "EOS 5D",
        iso: 100,
        aperture: 2.8,
        focalLength: 50,
      };
      const score = scoreMetadata(metadata);
      expect(score).toBe(100);
    });

    it("should score partial EXIF data moderately", () => {
      const metadata = {
        timestamp: "2023-01-01",
        cameraMake: "Canon",
      };
      const score = scoreMetadata(metadata);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });

    it("should score empty metadata as zero", () => {
      const score = scoreMetadata({});
      expect(score).toBe(0);
    });
  });
});
