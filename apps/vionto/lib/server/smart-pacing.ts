/**
 * Smart pacing integration for Vionto render pipeline.
 *
 * This module orchestrates image scoring, clustering, and pacing
 * to generate optimized render manifests.
 */

import { prisma } from "@asafarim/db";
import { scoreImages } from "./image-scoring";
import { extractClusteringData, clusterImages } from "./image-clustering";
import { generatePacingPlan, getPacingSummary } from "./pacing";
import { getObjectBytes } from "./storage";
import type { ImageScore } from "./image-scoring";
import type { ImageCluster } from "./image-clustering";
import type { PacingPlan } from "./pacing";
import type { RenderAsset } from "./render-manifest";

export interface SmartPacingResult {
  pacingPlan: PacingPlan[];
  imageScores: ImageScore[];
  clusters: ImageCluster[];
  summary: {
    totalDuration: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    assetCount: number;
  };
}

/**
 * Analyze project assets and generate smart pacing plan.
 */
export async function analyzeProjectForPacing(
  projectId: string,
  emotionalTone: string,
  storyMode: string,
  options?: {
    skipBlurDetection?: boolean;
    skipDuplicateDetection?: boolean;
    targetTotalDurationSeconds?: number;
    preferShorterCuts?: boolean;
    /** When set, only analyze these asset IDs (e.g. the album subset being rendered). */
    assetIds?: string[];
  }
): Promise<SmartPacingResult> {
  // Fetch only the assets that will actually be rendered so the pacing plan
  // distributes the target duration across the correct number of images.
  const assets = await prisma.viontoAsset.findMany({
    where: {
      projectId,
      type: "source_image",
      ...(options?.assetIds?.length ? { id: { in: options.assetIds } } : {}),
    },
    select: {
      id: true,
      storageKey: true,
      caption: true,
      metadata: true,
      orderIndex: true,
      width: true,
      height: true,
      createdAt: true,
    },
    orderBy: { orderIndex: "asc" },
  });

  if (assets.length === 0) {
    return {
      pacingPlan: [],
      imageScores: [],
      clusters: [],
      summary: {
        totalDuration: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        assetCount: 0,
      },
    };
  }

  // Function to fetch image buffer from storage
  const getBuffer = async (storageKey: string): Promise<Buffer | null> => {
    try {
      const buffer = await getObjectBytes(storageKey);
      return buffer;
    } catch (error) {
      console.error(`[smart-pacing] Failed to fetch buffer for ${storageKey}:`, error);
      return null;
    }
  };

  // Score images
  const { scores, hashes } = await scoreImages(
    assets.map((a) => ({
      id: a.id,
      storageKey: a.storageKey!,
      caption: a.caption,
      metadata: a.metadata as Record<string, unknown> | null,
    })),
    getBuffer,
    {
      blurThreshold: options?.skipBlurDetection ? 0 : 30,
      duplicateThreshold: options?.skipDuplicateDetection ? 100 : 85,
    }
  );

  // Store perceptual hashes in metadata for future use
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const hash = hashes.get(asset.id);
    if (hash && asset.metadata) {
      await prisma.viontoAsset.update({
        where: { id: asset.id },
        data: {
          metadata: {
            ...(asset.metadata as Record<string, unknown>),
            perceptualHash: hash,
          },
        },
      }).catch((error) => {
        console.error(`[smart-pacing] Failed to update metadata for ${asset.id}:`, error);
      });
    }
  }

  // Create score map
  const scoreMap = new Map<string, ImageScore>();
  for (const score of scores) {
    scoreMap.set(score.assetId, score);
  }

  // Extract clustering data
  const clusteringData = extractClusteringData(
    assets.map((a) => ({
      id: a.id,
      metadata: a.metadata,
      createdAt: a.createdAt,
    }))
  );

  // Cluster images
  const clusters = clusterImages(clusteringData, scoreMap);

  // Generate pacing plan
  const pacingPlan = generatePacingPlan(
    assets.map((a) => ({ id: a.id, orderIndex: a.orderIndex })),
    scoreMap,
    clusters,
    emotionalTone,
    storyMode,
    {
      targetTotalDurationSeconds: options?.targetTotalDurationSeconds,
      preferShorterCuts: options?.preferShorterCuts,
    }
  );

  // Calculate summary
  const summary = getPacingSummary(pacingPlan);

  return {
    pacingPlan,
    imageScores: scores,
    clusters,
    summary,
  };
}

/**
 * Apply pacing plan to render assets.
 */
export function applyPacingToAssets(
  assets: Array<{ id: string; storageKey: string; width?: number; height?: number }>,
  pacingPlan: PacingPlan[]
): RenderAsset[] {
  return assets.map((asset) => {
    // Match by Prisma asset ID (primary) or storageKey (fallback)
    const plan = pacingPlan.find((p) => p.assetId === asset.id || p.assetId === asset.storageKey);

    if (!plan) {
      // Default if no plan found
      return {
        storageKey: asset.storageKey,
        width: asset.width,
        height: asset.height,
        durationSeconds: 5,
      };
    }

    return {
      storageKey: asset.storageKey,
      width: asset.width,
      height: asset.height,
      durationSeconds: plan.durationSeconds,
      motion: plan.motion,
      transition: plan.transition,
    };
  });
}

/**
 * Downrank blurry and duplicate images in asset list.
 * Returns a new array with assets re-ordered by quality score.
 */
export function downrankLowQualityAssets(
  assets: Array<{ id: string; storageKey: string }>,
  imageScores: ImageScore[]
): Array<{ id: string; storageKey: string }> {
  const scoreMap = new Map(imageScores.map((s) => [s.assetId, s]));

  // Sort by quality score (highest first)
  return [...assets].sort((a, b) => {
    const scoreA = scoreMap.get(a.id)?.qualityScore || 50;
    const scoreB = scoreMap.get(b.id)?.qualityScore || 50;
    return scoreB - scoreA;
  });
}
