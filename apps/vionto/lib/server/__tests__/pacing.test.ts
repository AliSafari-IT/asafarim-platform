/**
 * Tests for pacing module.
 */

import { describe, it, expect } from "vitest";
import {
  getPacingConfig,
  calculateImageDuration,
  selectTransitionStyle,
  selectMotionPreset,
  generatePacingPlan,
  calculateTotalDuration,
  getPacingSummary,
} from "../pacing";
import type { ImageScore } from "../image-scoring";
import type { ImageCluster } from "../image-clustering";

describe("pacing", () => {
  describe("getPacingConfig", () => {
    it("should return config for nostalgic tone", () => {
      const config = getPacingConfig("nostalgic");
      expect(config.baseDurationSeconds).toBe(6);
      expect(config.minDurationSeconds).toBe(4);
      expect(config.maxDurationSeconds).toBe(10);
    });

    it("should return config for joyful tone", () => {
      const config = getPacingConfig("joyful");
      expect(config.baseDurationSeconds).toBe(4);
      expect(config.minDurationSeconds).toBe(3);
      expect(config.maxDurationSeconds).toBe(7);
    });

    it("should return default config for unknown tone", () => {
      const config = getPacingConfig("unknown");
      expect(config.baseDurationSeconds).toBe(6); // Default to nostalgic
    });
  });

  describe("calculateImageDuration", () => {
    it("should calculate base duration", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 50,
        blurScore: 50,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const config = getPacingConfig("nostalgic");
      const duration = calculateImageDuration(score, config, false, 1.0);
      expect(duration).toBeCloseTo(6, 0);
    });

    it("should increase duration for high quality images", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 90,
        blurScore: 90,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const config = getPacingConfig("nostalgic");
      const duration = calculateImageDuration(score, config, false, 1.0);
      expect(duration).toBeGreaterThan(6);
    });

    it("should decrease duration for blurry images", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 30,
        blurScore: 20,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: true,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const config = getPacingConfig("nostalgic");
      const duration = calculateImageDuration(score, config, false, 1.0);
      expect(duration).toBeLessThan(6);
    });

    it("should increase duration for cluster representatives", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 50,
        blurScore: 50,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const config = getPacingConfig("nostalgic");
      const duration = calculateImageDuration(score, config, true, 1.0);
      expect(duration).toBeGreaterThan(6);
    });

    it("should clamp to min/max bounds", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 100,
        blurScore: 100,
        uniquenessScore: 100,
        faceScore: 100,
        landmarkScore: 100,
        metadataScore: 100,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: true,
        hasLandmarks: true,
      };
      const config = getPacingConfig("nostalgic");
      const duration = calculateImageDuration(score, config, true, 1.0);
      expect(duration).toBeLessThanOrEqual(config.maxDurationSeconds);
    });
  });

  describe("selectTransitionStyle", () => {
    it("should return fast transition for short durations", () => {
      const transition = selectTransitionStyle(2, "nostalgic");
      expect(transition.name).toBe("fade");
      expect(transition.durationSeconds).toBe(0.3);
    });

    it("should return cinematic transition for long durations with emotional tones", () => {
      const transition = selectTransitionStyle(9, "nostalgic");
      expect(transition.name).toBe("crossfade");
      expect(transition.durationSeconds).toBe(1.0);
    });

    it("should return normal transition for medium durations", () => {
      const transition = selectTransitionStyle(5, "epic");
      expect(transition.name).toBe("fade");
      expect(transition.durationSeconds).toBe(0.5);
    });
  });

  describe("selectMotionPreset", () => {
    it("should return static for very short durations", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 50,
        blurScore: 50,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const motion = selectMotionPreset(2, score, "nostalgic");
      expect(motion.name).toBe("static");
    });

    it("should return ken burns for epic with high quality", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 80,
        blurScore: 80,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const motion = selectMotionPreset(5, score, "epic");
      expect(motion.name).toBe("ken_burns");
    });

    it("should return slow zoom for calm/romantic", () => {
      const score: ImageScore = {
        assetId: "1",
        qualityScore: 50,
        blurScore: 50,
        uniquenessScore: 100,
        faceScore: 0,
        landmarkScore: 0,
        metadataScore: 0,
        isBlurry: false,
        isDuplicate: false,
        hasFaces: false,
        hasLandmarks: false,
      };
      const motion = selectMotionPreset(5, score, "calm");
      expect(motion.name).toBe("zoom_in");
    });
  });

  describe("generatePacingPlan", () => {
    it("should generate pacing plan for assets", () => {
      const assets = [
        { id: "1", orderIndex: 0 },
        { id: "2", orderIndex: 1 },
        { id: "3", orderIndex: 2 },
      ];
      const imageScores = new Map<string, ImageScore>([
        [
          "1",
          {
            assetId: "1",
            qualityScore: 50,
            blurScore: 50,
            uniquenessScore: 100,
            faceScore: 0,
            landmarkScore: 0,
            metadataScore: 0,
            isBlurry: false,
            isDuplicate: false,
            hasFaces: false,
            hasLandmarks: false,
          },
        ],
        [
          "2",
          {
            assetId: "2",
            qualityScore: 70,
            blurScore: 70,
            uniquenessScore: 100,
            faceScore: 0,
            landmarkScore: 0,
            metadataScore: 0,
            isBlurry: false,
            isDuplicate: false,
            hasFaces: false,
            hasLandmarks: false,
          },
        ],
        [
          "3",
          {
            assetId: "3",
            qualityScore: 30,
            blurScore: 30,
            uniquenessScore: 100,
            faceScore: 0,
            landmarkScore: 0,
            metadataScore: 0,
            isBlurry: true,
            isDuplicate: false,
            hasFaces: false,
            hasLandmarks: false,
          },
        ],
      ]);
      const clusters: ImageCluster[] = [
        {
          id: "cluster-1",
          assetIds: ["1"],
          clusterType: "time",
          avgQualityScore: 50,
          representativeAssetId: "1",
        },
      ];

      const plan = generatePacingPlan(assets, imageScores, clusters, "nostalgic", "memory_film");
      expect(plan).toHaveLength(3);
      expect(plan[0].assetId).toBe("1");
      expect(plan[1].assetId).toBe("2");
      expect(plan[2].assetId).toBe("3");
    });

    it("should handle assets without scores", () => {
      const assets = [{ id: "1", orderIndex: 0 }];
      const imageScores = new Map<string, ImageScore>();
      const clusters: ImageCluster[] = [];

      const plan = generatePacingPlan(assets, imageScores, clusters, "nostalgic", "memory_film");
      expect(plan).toHaveLength(1);
      expect(plan[0].durationSeconds).toBe(6); // Default base duration
    });

    it("should scale durations to target total duration", () => {
      const assets = [
        { id: "1", orderIndex: 0 },
        { id: "2", orderIndex: 1 },
      ];
      const imageScores = new Map<string, ImageScore>([
        [
          "1",
          {
            assetId: "1",
            qualityScore: 50,
            blurScore: 50,
            uniquenessScore: 100,
            faceScore: 0,
            landmarkScore: 0,
            metadataScore: 0,
            isBlurry: false,
            isDuplicate: false,
            hasFaces: false,
            hasLandmarks: false,
          },
        ],
        [
          "2",
          {
            assetId: "2",
            qualityScore: 50,
            blurScore: 50,
            uniquenessScore: 100,
            faceScore: 0,
            landmarkScore: 0,
            metadataScore: 0,
            isBlurry: false,
            isDuplicate: false,
            hasFaces: false,
            hasLandmarks: false,
          },
        ],
      ]);
      const clusters: ImageCluster[] = [];

      const plan = generatePacingPlan(
        assets,
        imageScores,
        clusters,
        "nostalgic",
        "memory_film",
        { targetTotalDurationSeconds: 10 }
      );
      const total = calculateTotalDuration(plan);
      expect(total).toBeCloseTo(10, 0);
    });
  });

  describe("calculateTotalDuration", () => {
    it("should sum all durations", () => {
      const plans = [
        { assetId: "1", durationSeconds: 5, motion: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 }, transition: { name: "fade" as const, durationSeconds: 0.5 }, reason: "" },
        { assetId: "2", durationSeconds: 6, motion: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 }, transition: { name: "fade" as const, durationSeconds: 0.5 }, reason: "" },
        { assetId: "3", durationSeconds: 4, motion: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 }, transition: { name: "fade" as const, durationSeconds: 0.5 }, reason: "" },
      ];
      const total = calculateTotalDuration(plans);
      expect(total).toBe(15);
    });

    it("should return 0 for empty plan", () => {
      const total = calculateTotalDuration([]);
      expect(total).toBe(0);
    });
  });

  describe("getPacingSummary", () => {
    it("should calculate summary statistics", () => {
      const plans = [
        { assetId: "1", durationSeconds: 5, motion: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 }, transition: { name: "fade" as const, durationSeconds: 0.5 }, reason: "" },
        { assetId: "2", durationSeconds: 6, motion: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 }, transition: { name: "fade" as const, durationSeconds: 0.5 }, reason: "" },
        { assetId: "3", durationSeconds: 4, motion: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 }, transition: { name: "fade" as const, durationSeconds: 0.5 }, reason: "" },
      ];
      const summary = getPacingSummary(plans);
      expect(summary.totalDuration).toBe(15);
      expect(summary.avgDuration).toBe(5);
      expect(summary.minDuration).toBe(4);
      expect(summary.maxDuration).toBe(6);
      expect(summary.assetCount).toBe(3);
    });

    it("should handle empty plan", () => {
      const summary = getPacingSummary([]);
      expect(summary.totalDuration).toBe(0);
      expect(summary.avgDuration).toBe(0);
      expect(summary.minDuration).toBe(0);
      expect(summary.maxDuration).toBe(0);
      expect(summary.assetCount).toBe(0);
    });
  });
});
