/**
 * Tests for image clustering module.
 */

import { describe, it, expect } from "vitest";
import { haversineDistance, parseTimestamp, clusterByTime, clusterByLocation, clusterByVisual, compareHashes } from "../image-clustering";

describe("image-clustering", () => {
  describe("haversineDistance", () => {
    it("should calculate distance between two points", () => {
      const distance = haversineDistance(48.8566, 2.3522, 40.7128, -74.0060); // Paris to NYC
      expect(distance).toBeGreaterThan(5000);
      expect(distance).toBeLessThan(6000);
    });

    it("should return 0 for same coordinates", () => {
      const distance = haversineDistance(48.8566, 2.3522, 48.8566, 2.3522);
      expect(distance).toBe(0);
    });

    it("should calculate short distances accurately", () => {
      const distance = haversineDistance(48.8566, 2.3522, 48.8600, 2.3600);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1);
    });
  });

  describe("parseTimestamp", () => {
    it("should parse ISO timestamp", () => {
      const date = parseTimestamp("2023-01-15T10:30:00Z");
      expect(date).not.toBeNull();
      expect(date?.toISOString()).toBe("2023-01-15T10:30:00.000Z");
    });

    it("should parse EXIF date format", () => {
      const date = parseTimestamp("2023-01-15");
      expect(date).not.toBeNull();
      expect(date?.toISOString().startsWith("2023-01-15")).toBe(true);
    });

    it("should return null for invalid timestamp", () => {
      const date = parseTimestamp("invalid");
      expect(date).toBeNull();
    });

    it("should return null for undefined", () => {
      const date = parseTimestamp(undefined);
      expect(date).toBeNull();
    });
  });

  describe("clusterByTime", () => {
    it("should cluster images within time gap", () => {
      const assets = [
        { id: "1", timestamp: "2023-01-01", createdAt: new Date("2023-01-01") },
        { id: "2", timestamp: "2023-01-02", createdAt: new Date("2023-01-02") },
        { id: "3", timestamp: "2023-01-25", createdAt: new Date("2023-01-25") }, // 23 days later
      ];
      const clusters = clusterByTime(assets, { timeGapHours: 24 });
      expect(clusters.length).toBe(2); // Two clusters: first two together, third separate
    });

    it("should return empty array for no assets", () => {
      const clusters = clusterByTime([]);
      expect(clusters).toEqual([]);
    });

    it("should not cluster if min cluster size not met", () => {
      const assets = [
        { id: "1", timestamp: "2023-01-01", createdAt: new Date("2023-01-01") },
      ];
      const clusters = clusterByTime(assets, { minClusterSize: 2 });
      expect(clusters).toEqual([]);
    });
  });

  describe("clusterByLocation", () => {
    it("should cluster images within radius", () => {
      const assets = [
        { id: "1", gpsLatitude: 48.8566, gpsLongitude: 2.3522 },
        { id: "2", gpsLatitude: 48.8600, gpsLongitude: 2.3600 }, // Close to first
        { id: "3", gpsLatitude: 40.7128, gpsLongitude: -74.0060 }, // Far away (NYC)
      ];
      const clusters = clusterByLocation(assets, { locationRadiusKm: 10 });
      expect(clusters.length).toBe(1); // First two cluster together
      expect(clusters[0].assetIds).toContain("1");
      expect(clusters[0].assetIds).toContain("2");
    });

    it("should return empty array for no GPS data", () => {
      const assets = [
        { id: "1", gpsLatitude: undefined, gpsLongitude: undefined },
      ];
      const clusters = clusterByLocation(assets);
      expect(clusters).toEqual([]);
    });

    it("should return empty array for no assets", () => {
      const clusters = clusterByLocation([]);
      expect(clusters).toEqual([]);
    });
  });

  describe("clusterByVisual", () => {
    it("should cluster visually similar images", () => {
      const assets = [
        { id: "1", perceptualHash: "11111111" },
        { id: "2", perceptualHash: "11111110" }, // 87.5% similar
        { id: "3", perceptualHash: "00000000" }, // Completely different
      ];
      const clusters = clusterByVisual(assets, { visualSimilarityThreshold: 85 });
      expect(clusters.length).toBe(1); // First two cluster together
      expect(clusters[0].assetIds).toContain("1");
      expect(clusters[0].assetIds).toContain("2");
    });

    it("should return empty array for no hashes", () => {
      const assets = [
        { id: "1", perceptualHash: undefined },
      ];
      const clusters = clusterByVisual(assets);
      expect(clusters).toEqual([]);
    });

    it("should return empty array for no assets", () => {
      const clusters = clusterByVisual([]);
      expect(clusters).toEqual([]);
    });
  });

  describe("compareHashes", () => {
    it("should return 100 for identical hashes", () => {
      const similarity = compareHashes("11111111", "11111111");
      expect(similarity).toBe(100);
    });

    it("should return 0 for completely different hashes", () => {
      const similarity = compareHashes("11111111", "00000000");
      expect(similarity).toBe(0);
    });

    it("should return 50 for half-matching hashes", () => {
      const similarity = compareHashes("11110000", "11000000");
      expect(similarity).toBe(50);
    });
  });
});
