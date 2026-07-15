/**
 * Image quality scoring and analysis for smart pacing.
 *
 * This module provides:
 * - Blur detection using Laplacian variance
 * - Duplicate detection using perceptual hashing
 * - Face/landmark detection hints (via caption analysis for MVP)
 * - Overall quality scoring
 */

import sharp from "sharp";

export interface ImageScore {
  assetId: string;
  qualityScore: number; // 0-100, higher is better
  blurScore: number; // 0-100, higher is less blurry
  uniquenessScore: number; // 0-100, higher is more unique
  faceScore: number; // 0-100, higher if faces detected
  landmarkScore: number; // 0-100, higher if landmarks detected
  metadataScore: number; // 0-100, based on EXIF richness
  isBlurry: boolean;
  isDuplicate: boolean;
  hasFaces: boolean;
  hasLandmarks: boolean;
}

export interface ImageAnalysisOptions {
  blurThreshold?: number; // Below this score, image is considered blurry
  duplicateThreshold?: number; // Below this similarity, images are duplicates
}

const DEFAULT_OPTIONS: ImageAnalysisOptions = {
  blurThreshold: 30,
  duplicateThreshold: 85,
};

/**
 * Detect blur in an image using Laplacian variance.
 * Returns a score from 0-100 (higher = sharper).
 */
export async function detectBlur(imageBuffer: Buffer): Promise<number> {
  try {
    // Convert to grayscale and resize for faster processing
    const { data, info } = await sharp(imageBuffer)
      .resize(256, 256, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    // Calculate Laplacian variance
    let sum = 0;
    let sumSquared = 0;
    const pixelCount = width * height;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        // Laplacian kernel: [[0, -1, 0], [-1, 4, -1], [0, -1, 0]]
        const laplacian =
          -4 * data[idx] +
          data[idx - 1] +
          data[idx + 1] +
          data[idx - width] +
          data[idx + width];

        sum += laplacian;
        sumSquared += laplacian * laplacian;
      }
    }

    const mean = sum / pixelCount;
    const variance = (sumSquared / pixelCount) - (mean * mean);

    // Normalize variance to 0-100 scale (typical range for sharp images is 100-1000)
    const normalizedScore = Math.min(100, Math.max(0, variance / 10));

    return normalizedScore;
  } catch (error) {
    console.error("[image-scoring] Blur detection failed:", error);
    return 50; // Return neutral score on error
  }
}

/**
 * Calculate perceptual hash for duplicate detection.
 * Uses a simple average hash algorithm.
 */
export async function calculatePerceptualHash(imageBuffer: Buffer): Promise<string> {
  try {
    // Resize to 8x8 grayscale
    const { data } = await sharp(imageBuffer)
      .resize(8, 8, { fit: "cover" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;

    // Generate hash based on comparison to average
    let hash = "";
    for (let i = 0; i < data.length; i++) {
      hash += data[i] > avg ? "1" : "0";
    }

    return hash;
  } catch (error) {
    console.error("[image-scoring] Perceptual hash calculation failed:", error);
    return "";
  }
}

/**
 * Compare two perceptual hashes and return similarity percentage (0-100).
 */
export function compareHashes(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return 0;

  let matches = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] === hash2[i]) matches++;
  }

  return (matches / hash1.length) * 100;
}

/**
 * Analyze image caption for face/landmark hints.
 * This is a lightweight approach for MVP without running full vision models.
 */
export function analyzeCaptionForFeatures(caption: string): { faces: number; landmarks: number } {
  const lowerCaption = caption.toLowerCase();
  
  // Face-related keywords
  const faceKeywords = ["person", "people", "face", "portrait", "selfie", "group", "family", "friend", "child", "baby", "man", "woman", "girl", "boy"];
  // Landmark-related keywords
  const landmarkKeywords = ["building", "monument", "statue", "bridge", "tower", "castle", "church", "temple", "mountain", "beach", "ocean", "river", "lake", "park", "street", "city", "landmark", "scenery", "landscape"];
  
  let faces = 0;
  let landmarks = 0;
  
  for (const keyword of faceKeywords) {
    if (lowerCaption.includes(keyword)) faces += 1;
  }
  
  for (const keyword of landmarkKeywords) {
    if (lowerCaption.includes(keyword)) landmarks += 1;
  }
  
  // Cap at reasonable values
  return {
    faces: Math.min(5, faces),
    landmarks: Math.min(5, landmarks),
  };
}

/**
 * Score EXIF metadata richness.
 */
export function scoreMetadata(metadata: Record<string, unknown>): number {
  let score = 0;
  
  // Check for key EXIF fields
  if (metadata.timestamp) score += 20;
  if (metadata.gpsLatitude && metadata.gpsLongitude) score += 25;
  if (metadata.cameraMake) score += 15;
  if (metadata.cameraModel) score += 10;
  if (metadata.iso) score += 10;
  if (metadata.aperture) score += 10;
  if (metadata.focalLength) score += 10;
  
  return Math.min(100, score);
}

/**
 * Comprehensive image scoring.
 */
export async function scoreImage(
  assetId: string,
  imageBuffer: Buffer | null,
  caption: string | null,
  metadata: Record<string, unknown> | null,
  existingHashes: Map<string, string>,
  options: ImageAnalysisOptions = {}
): Promise<ImageScore> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Initialize scores
  let blurScore = 50;
  let uniquenessScore = 100;
  let faceScore = 0;
  let landmarkScore = 0;
  let metadataScore = 0;
  
  // Detect blur if buffer is available
  if (imageBuffer) {
    blurScore = await detectBlur(imageBuffer);
  }
  
  // Calculate perceptual hash for duplicate detection
  let currentHash = "";
  let isDuplicate = false;
  if (imageBuffer) {
    currentHash = await calculatePerceptualHash(imageBuffer);
    
    // Check against existing hashes
    for (const [existingId, existingHash] of existingHashes.entries()) {
      const similarity = compareHashes(currentHash, existingHash);
      if (similarity >= opts.duplicateThreshold!) {
        isDuplicate = true;
        uniquenessScore = 100 - similarity;
        break;
      }
    }
  }
  
  // Analyze caption for features
  if (caption) {
    const features = analyzeCaptionForFeatures(caption);
    faceScore = features.faces * 20; // Each face keyword adds 20 points
    landmarkScore = features.landmarks * 20; // Each landmark keyword adds 20 points
  }
  
  // Score metadata
  if (metadata) {
    metadataScore = scoreMetadata(metadata);
  }
  
  // Calculate overall quality score (weighted average)
  const qualityScore =
    (blurScore * 0.3) +
    (uniquenessScore * 0.25) +
    (faceScore * 0.2) +
    (landmarkScore * 0.1) +
    (metadataScore * 0.15);
  
  return {
    assetId,
    qualityScore: Math.round(qualityScore),
    blurScore: Math.round(blurScore),
    uniquenessScore: Math.round(uniquenessScore),
    faceScore: Math.round(faceScore),
    landmarkScore: Math.round(landmarkScore),
    metadataScore: Math.round(metadataScore),
    isBlurry: blurScore < opts.blurThreshold!,
    isDuplicate,
    hasFaces: faceScore > 0,
    hasLandmarks: landmarkScore > 0,
  };
}

/**
 * Score multiple images and return results with hash map.
 */
export async function scoreImages(
  assets: Array<{
    id: string;
    storageKey: string;
    caption: string | null;
    metadata: Record<string, unknown> | null;
  }>,
  getBuffer: (storageKey: string) => Promise<Buffer | null>,
  options?: ImageAnalysisOptions
): Promise<{ scores: ImageScore[]; hashes: Map<string, string> }> {
  const scores: ImageScore[] = [];
  const hashes = new Map<string, string>();
  
  for (const asset of assets) {
    const buffer = await getBuffer(asset.storageKey);
    const score = await scoreImage(
      asset.id,
      buffer,
      asset.caption,
      asset.metadata,
      hashes,
      options
    );
    
    // Store hash for future comparisons
    if (buffer) {
      const hash = await calculatePerceptualHash(buffer);
      hashes.set(asset.id, hash);
    }
    
    scores.push(score);
  }
  
  return { scores, hashes };
}
