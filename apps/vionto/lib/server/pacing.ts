/**
 * Smart pacing logic for Vionto album videos.
 *
 * This module provides:
 * - Duration calculation based on emotional tone and story mode
 * - Quality-based duration adjustments
 * - Transition style selection
 * - Motion preset generation
 */

import type { ImageScore } from "./image-scoring";
import type { ImageCluster } from "./image-clustering";
import type { MotionPreset, TransitionPreset } from "./render-manifest";

export interface PacingConfig {
  baseDurationSeconds: number; // Base duration per image
  minDurationSeconds: number; // Minimum duration for any image
  maxDurationSeconds: number; // Maximum duration for any image
  qualityMultiplier: number; // How much quality affects duration (0-1)
  clusterDurationBonus: number; // Extra time for cluster representative images
}

export interface PacingPlan {
  assetId: string;
  durationSeconds: number;
  motion: MotionPreset;
  transition: TransitionPreset;
  reason: string; // Explanation for the pacing decision
}

export interface PacingOptions {
  targetTotalDurationSeconds?: number;
  preferShorterCuts?: boolean;
}

// Pacing configurations based on emotional tone
const EMOTIONAL_TONE_PACING: Record<string, PacingConfig> = {
  nostalgic: {
    baseDurationSeconds: 6,
    minDurationSeconds: 4,
    maxDurationSeconds: 10,
    qualityMultiplier: 0.5,
    clusterDurationBonus: 2,
  },
  joyful: {
    baseDurationSeconds: 4,
    minDurationSeconds: 3,
    maxDurationSeconds: 7,
    qualityMultiplier: 0.3,
    clusterDurationBonus: 1,
  },
  calm: {
    baseDurationSeconds: 7,
    minDurationSeconds: 5,
    maxDurationSeconds: 12,
    qualityMultiplier: 0.6,
    clusterDurationBonus: 3,
  },
  epic: {
    baseDurationSeconds: 5,
    minDurationSeconds: 3,
    maxDurationSeconds: 8,
    qualityMultiplier: 0.4,
    clusterDurationBonus: 2,
  },
  funny: {
    baseDurationSeconds: 3,
    minDurationSeconds: 2,
    maxDurationSeconds: 5,
    qualityMultiplier: 0.2,
    clusterDurationBonus: 0.5,
  },
  romantic: {
    baseDurationSeconds: 6,
    minDurationSeconds: 4,
    maxDurationSeconds: 10,
    qualityMultiplier: 0.5,
    clusterDurationBonus: 2,
  },
  reflective: {
    baseDurationSeconds: 7,
    minDurationSeconds: 5,
    maxDurationSeconds: 12,
    qualityMultiplier: 0.6,
    clusterDurationBonus: 3,
  },
};

// Pacing configurations based on story mode
const STORY_MODE_PACING_MULTIPLIERS: Record<string, number> = {
  memory_film: 1.0,
  travel_recap: 0.9,
  family_archive: 1.1,
  event_recap: 0.8,
  social_reel: 0.5,
  documentary: 1.2,
};

// Transition styles based on pacing
const TRANSITION_STYLES = {
  fast: { name: "fade" as const, durationSeconds: 0.3 },
  normal: { name: "fade" as const, durationSeconds: 0.5 },
  slow: { name: "crossfade" as const, durationSeconds: 0.8 },
  cinematic: { name: "crossfade" as const, durationSeconds: 1.0 },
};

// Motion presets based on pacing
const MOTION_PRESETS = {
  static: { name: "static" as const, startScale: 1, endScale: 1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 },
  slow_zoom: { name: "zoom_in" as const, startScale: 1, endScale: 1.1, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 },
  medium_zoom: { name: "zoom_in" as const, startScale: 1, endScale: 1.15, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 },
  ken_burns: { name: "ken_burns" as const, startScale: 1, endScale: 1.2, startX: 0, endX: 0, startY: 0, endY: 0, durationSeconds: 5 },
  fast_pan: { name: "pan_right" as const, startScale: 1, endScale: 1, startX: -0.1, endX: 0.1, startY: 0, endY: 0, durationSeconds: 3 },
};

/**
 * Get pacing configuration for emotional tone.
 */
export function getPacingConfig(emotionalTone: string): PacingConfig {
  return EMOTIONAL_TONE_PACING[emotionalTone] || EMOTIONAL_TONE_PACING.nostalgic;
}

/**
 * Calculate duration for a single image based on quality and context.
 */
export function calculateImageDuration(
  score: ImageScore,
  config: PacingConfig,
  isClusterRepresentative: boolean,
  storyModeMultiplier: number = 1.0
): number {
  let duration = config.baseDurationSeconds * storyModeMultiplier;
  
  // Adjust based on quality (higher quality = longer duration)
  const qualityBonus = (score.qualityScore - 50) * config.qualityMultiplier * 0.05;
  duration += qualityBonus;
  
  // Bonus for cluster representative images
  if (isClusterRepresentative) {
    duration += config.clusterDurationBonus;
  }
  
  // Penalty for blurry images
  if (score.isBlurry) {
    duration *= 0.7;
  }
  
  // Penalty for duplicates
  if (score.isDuplicate) {
    duration *= 0.8;
  }
  
  // Bonus for faces
  if (score.hasFaces) {
    duration *= 1.1;
  }
  
  // Bonus for landmarks
  if (score.hasLandmarks) {
    duration *= 1.15;
  }
  
  // Clamp to min/max
  return Math.max(config.minDurationSeconds, Math.min(config.maxDurationSeconds, duration));
}

/**
 * Select transition style based on pacing.
 */
export function selectTransitionStyle(
  durationSeconds: number,
  emotionalTone: string
): TransitionPreset {
  // Shorter durations = faster transitions
  if (durationSeconds < 3) {
    return TRANSITION_STYLES.fast;
  }
  
  // Longer durations = slower transitions for emotional tones
  if (["nostalgic", "calm", "romantic", "reflective"].includes(emotionalTone)) {
    if (durationSeconds > 8) return TRANSITION_STYLES.cinematic;
    return TRANSITION_STYLES.slow;
  }
  
  return TRANSITION_STYLES.normal;
}

/**
 * Select motion preset based on pacing and image characteristics.
 */
export function selectMotionPreset(
  durationSeconds: number,
  score: ImageScore,
  emotionalTone: string
): MotionPreset {
  // Static for very short durations
  if (durationSeconds < 2.5) {
    return MOTION_PRESETS.static;
  }
  
  // Ken Burns for epic/nostalgic with high quality
  if (["epic", "nostalgic"].includes(emotionalTone) && score.qualityScore > 70) {
    return {
      ...MOTION_PRESETS.ken_burns,
      durationSeconds: Math.min(durationSeconds, 8),
    };
  }
  
  // Slow zoom for calm/romantic
  if (["calm", "romantic", "reflective"].includes(emotionalTone)) {
    return {
      ...MOTION_PRESETS.slow_zoom,
      durationSeconds: Math.min(durationSeconds, 7),
    };
  }
  
  // Medium zoom for high quality images
  if (score.qualityScore > 75) {
    return {
      ...MOTION_PRESETS.medium_zoom,
      durationSeconds: Math.min(durationSeconds, 6),
    };
  }
  
  // Fast pan for action/event modes
  if (["joyful", "funny"].includes(emotionalTone)) {
    return {
      ...MOTION_PRESETS.fast_pan,
      durationSeconds: Math.min(durationSeconds, 4),
    };
  }
  
  // Default: slow zoom
  return {
    ...MOTION_PRESETS.slow_zoom,
    durationSeconds: Math.min(durationSeconds, 6),
  };
}

/**
 * Generate a complete pacing plan for all assets.
 */
export function generatePacingPlan(
  assets: Array<{ id: string; orderIndex: number }>,
  imageScores: Map<string, ImageScore>,
  clusters: ImageCluster[],
  emotionalTone: string,
  storyMode: string,
  options: PacingOptions = {}
): PacingPlan[] {
  const config = getPacingConfig(emotionalTone);
  const storyModeMultiplier = STORY_MODE_PACING_MULTIPLIERS[storyMode] || 1.0;
  
  // Create a map of cluster representative IDs
  const clusterRepresentatives = new Set<string>();
  for (const cluster of clusters) {
    clusterRepresentatives.add(cluster.representativeAssetId);
  }
  
  // Sort assets by order index
  const sortedAssets = [...assets].sort((a, b) => a.orderIndex - b.orderIndex);
  
  const plans: PacingPlan[] = [];
  
  for (const asset of sortedAssets) {
    const score = imageScores.get(asset.id);
    if (!score) {
      // Default plan if no score available
      plans.push({
        assetId: asset.id,
        durationSeconds: config.baseDurationSeconds * storyModeMultiplier,
        motion: MOTION_PRESETS.slow_zoom,
        transition: TRANSITION_STYLES.normal,
        reason: "No score available, using default",
      });
      continue;
    }
    
    const isRepresentative = clusterRepresentatives.has(asset.id);
    const duration = calculateImageDuration(
      score,
      config,
      isRepresentative,
      storyModeMultiplier
    );
    
    const motion = selectMotionPreset(duration, score, emotionalTone);
    const transition = selectTransitionStyle(duration, emotionalTone);
    
    let reason = `Base: ${config.baseDurationSeconds}s`;
    if (isRepresentative) reason += ` + cluster bonus`;
    if (score.qualityScore > 70) reason += ` + high quality`;
    if (score.isBlurry) reason += ` - blurry penalty`;
    if (score.hasFaces) reason += ` + faces`;
    if (score.hasLandmarks) reason += ` + landmarks`;
    
    plans.push({
      assetId: asset.id,
      durationSeconds: Math.round(duration * 10) / 10, // Round to 1 decimal
      motion,
      transition,
      reason,
    });
  }
  
  // Adjust total duration if target is specified
  if (options.targetTotalDurationSeconds) {
    const currentTotal = plans.reduce((sum, p) => sum + p.durationSeconds, 0);
    const targetTotal = options.targetTotalDurationSeconds;
    
    // First pass: scale all durations without clamping to preserve total
    const ratio = targetTotal / currentTotal;
    for (const plan of plans) {
      plan.durationSeconds = plan.durationSeconds * ratio;
    }
    
    // Second pass: only clamp extreme values, then redistribute the difference
    let totalAfterScaling = plans.reduce((sum, p) => sum + p.durationSeconds, 0);
    let adjustmentNeeded = targetTotal - totalAfterScaling;
    
    // Clamp only extreme outliers (more than 50% outside min/max range)
    const extremeMin = config.minDurationSeconds * 0.5;
    const extremeMax = config.maxDurationSeconds * 1.5;
    
    for (const plan of plans) {
      if (plan.durationSeconds < extremeMin) {
        const oldDuration = plan.durationSeconds;
        plan.durationSeconds = config.minDurationSeconds;
        adjustmentNeeded -= (plan.durationSeconds - oldDuration);
      } else if (plan.durationSeconds > extremeMax) {
        const oldDuration = plan.durationSeconds;
        plan.durationSeconds = config.maxDurationSeconds;
        adjustmentNeeded -= (plan.durationSeconds - oldDuration);
      }
    }
    
    // If we still need adjustment, distribute proportionally across non-clamped assets
    if (Math.abs(adjustmentNeeded) > 0.1) {
      const adjustablePlans = plans.filter(p => 
        p.durationSeconds >= config.minDurationSeconds && 
        p.durationSeconds <= config.maxDurationSeconds
      );
      
      if (adjustablePlans.length > 0) {
        const adjustmentPerAsset = adjustmentNeeded / adjustablePlans.length;
        for (const plan of adjustablePlans) {
          plan.durationSeconds = Math.max(
            config.minDurationSeconds,
            Math.min(config.maxDurationSeconds, plan.durationSeconds + adjustmentPerAsset)
          );
        }
      }
    }
    
    // Final check: update motion durations to match new image durations
    for (const plan of plans) {
      plan.motion.durationSeconds = Math.min(plan.durationSeconds, plan.motion.durationSeconds || 5);
    }
  }
  
  // Prefer shorter cuts if requested
  if (options.preferShorterCuts) {
    for (const plan of plans) {
      plan.durationSeconds = Math.max(
        config.minDurationSeconds,
        plan.durationSeconds * 0.8
      );
      plan.transition = TRANSITION_STYLES.fast;
    }
  }

  // Final enforcement: if the total still drifts from the target (e.g. because
  // min-duration clamping pushed it up), scale all durations proportionally so
  // the video length matches what the user asked for.
  if (options.targetTotalDurationSeconds) {
    const HARD_MIN = 1.0;
    const target = options.targetTotalDurationSeconds;
    const finalTotal = plans.reduce((sum, p) => sum + p.durationSeconds, 0);
    if (finalTotal > 0 && Math.abs(finalTotal - target) > 0.5) {
      const ratio = target / finalTotal;
      for (const plan of plans) {
        plan.durationSeconds = Math.max(HARD_MIN, Math.round(plan.durationSeconds * ratio * 10) / 10);
      }

      // Correct rounding drift by distributing the remainder across longest segments.
      const afterRounding = plans.reduce((sum, p) => sum + p.durationSeconds, 0);
      let remainder = Math.round((target - afterRounding) * 10) / 10;
      if (Math.abs(remainder) >= 0.05) {
        const step = remainder > 0 ? 0.1 : -0.1;
        const sorted = [...plans].sort((a, b) => b.durationSeconds - a.durationSeconds);
        for (const plan of sorted) {
          if (Math.abs(remainder) < 0.05) break;
          const adj = plan.durationSeconds + step;
          if (adj >= HARD_MIN) {
            plan.durationSeconds = Math.round(adj * 10) / 10;
            remainder = Math.round((remainder - step) * 10) / 10;
          }
        }
      }

      for (const plan of plans) {
        plan.motion.durationSeconds = Math.min(plan.durationSeconds, plan.motion.durationSeconds || 5);
      }
    }
  }

  return plans;
}

/**
 * Calculate total duration from a pacing plan.
 */
export function calculateTotalDuration(plans: PacingPlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.durationSeconds, 0);
}

/**
 * Get pacing summary for debugging/logging.
 */
export function getPacingSummary(plans: PacingPlan[]): {
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  assetCount: number;
} {
  if (plans.length === 0) {
    return {
      totalDuration: 0,
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      assetCount: 0,
    };
  }
  
  const durations = plans.map((p) => p.durationSeconds);
  const total = durations.reduce((a, b) => a + b, 0);
  
  return {
    totalDuration: Math.round(total * 10) / 10,
    avgDuration: Math.round((total / plans.length) * 10) / 10,
    minDuration: Math.round(Math.min(...durations) * 10) / 10,
    maxDuration: Math.round(Math.max(...durations) * 10) / 10,
    assetCount: plans.length,
  };
}
