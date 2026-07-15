/**
 * Image clustering for smart pacing.
 *
 * This module provides:
 * - Time-based clustering (grouping by timestamp proximity)
 * - Location-based clustering (grouping by GPS proximity)
 * - Visual similarity clustering (using perceptual hashes)
 * - Combined clustering strategy
 */

import type { ExifData } from "./exif";
import type { ImageScore } from "./image-scoring";

export interface ImageCluster {
  id: string;
  assetIds: string[];
  clusterType: "time" | "location" | "visual" | "mixed";
  startTime?: string;
  endTime?: string;
  location?: { latitude: number; longitude: number };
  avgQualityScore: number;
  representativeAssetId: string;
}

export interface ClusteringOptions {
  timeGapHours?: number; // Maximum gap between images in same time cluster (default: 24 hours)
  locationRadiusKm?: number; // Maximum radius for location cluster (default: 10 km)
  visualSimilarityThreshold?: number; // Minimum similarity for visual cluster (default: 85)
  minClusterSize?: number; // Minimum images to form a cluster (default: 2)
}

const DEFAULT_OPTIONS: ClusteringOptions = {
  timeGapHours: 24,
  locationRadiusKm: 10,
  visualSimilarityThreshold: 85,
  minClusterSize: 2,
};

/**
 * Calculate distance between two GPS coordinates in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Parse timestamp string to Date object.
 */
export function parseTimestamp(timestamp: string | undefined): Date | null {
  if (!timestamp) return null;
  
  // Handle various timestamp formats
  const date = new Date(timestamp);
  if (!isNaN(date.getTime())) return date;
  
  // Handle EXIF format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) {
    return new Date(timestamp + "T00:00:00Z");
  }
  
  return null;
}

/**
 * Cluster images by time proximity.
 */
export function clusterByTime(
  assets: Array<{ id: string; timestamp?: string; createdAt: Date }>,
  options: ClusteringOptions = {}
): ImageCluster[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const clusters: ImageCluster[] = [];
  
  // Sort assets by timestamp
  const sortedAssets = [...assets].sort((a, b) => {
    const dateA = parseTimestamp(a.timestamp) || a.createdAt;
    const dateB = parseTimestamp(b.timestamp) || b.createdAt;
    return dateA.getTime() - dateB.getTime();
  });
  
  if (sortedAssets.length === 0) return clusters;
  
  let currentCluster: ImageCluster = {
    id: `time-cluster-0`,
    assetIds: [sortedAssets[0].id],
    clusterType: "time",
    startTime: sortedAssets[0].timestamp || sortedAssets[0].createdAt.toISOString().split("T")[0],
    avgQualityScore: 0,
    representativeAssetId: sortedAssets[0].id,
  };
  
  for (let i = 1; i < sortedAssets.length; i++) {
    const currentAsset = sortedAssets[i];
    const prevAsset = sortedAssets[i - 1];
    
    const currentDate = parseTimestamp(currentAsset.timestamp) || currentAsset.createdAt;
    const prevDate = parseTimestamp(prevAsset.timestamp) || prevAsset.createdAt;
    
    const gapHours = (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);
    
    if (gapHours <= opts.timeGapHours!) {
      // Same cluster
      currentCluster.assetIds.push(currentAsset.id);
      if (currentAsset.timestamp) {
        currentCluster.endTime = currentAsset.timestamp;
      }
    } else {
      // New cluster
      if (currentCluster.assetIds.length >= opts.minClusterSize!) {
        clusters.push(currentCluster);
      }
      currentCluster = {
        id: `time-cluster-${clusters.length}`,
        assetIds: [currentAsset.id],
        clusterType: "time",
        startTime: currentAsset.timestamp || currentAsset.createdAt.toISOString().split("T")[0],
        avgQualityScore: 0,
        representativeAssetId: currentAsset.id,
      };
    }
  }
  
  // Don't forget the last cluster
  if (currentCluster.assetIds.length >= opts.minClusterSize!) {
    clusters.push(currentCluster);
  }
  
  return clusters;
}

/**
 * Cluster images by GPS proximity.
 */
export function clusterByLocation(
  assets: Array<{ id: string; gpsLatitude?: number; gpsLongitude?: number }>,
  options: ClusteringOptions = {}
): ImageCluster[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const clusters: ImageCluster[] = [];
  
  // Filter assets with GPS data
  const assetsWithGps = assets.filter(
    (a) => a.gpsLatitude !== undefined && a.gpsLongitude !== undefined
  );
  
  if (assetsWithGps.length === 0) return clusters;
  
  const visited = new Set<string>();
  
  for (const asset of assetsWithGps) {
    if (visited.has(asset.id)) continue;
    
    const clusterAssetIds: string[] = [asset.id];
    visited.add(asset.id);
    
    // Find nearby assets
    for (const other of assetsWithGps) {
      if (visited.has(other.id)) continue;
      if (other.gpsLatitude === undefined || other.gpsLongitude === undefined) continue;
      
      const distance = haversineDistance(
        asset.gpsLatitude!,
        asset.gpsLongitude!,
        other.gpsLatitude,
        other.gpsLongitude
      );
      
      if (distance <= opts.locationRadiusKm!) {
        clusterAssetIds.push(other.id);
        visited.add(other.id);
      }
    }
    
    if (clusterAssetIds.length >= opts.minClusterSize!) {
      clusters.push({
        id: `location-cluster-${clusters.length}`,
        assetIds: clusterAssetIds,
        clusterType: "location",
        location: {
          latitude: asset.gpsLatitude!,
          longitude: asset.gpsLongitude!,
        },
        avgQualityScore: 0,
        representativeAssetId: asset.id,
      });
    }
  }
  
  return clusters;
}

/**
 * Cluster images by visual similarity using perceptual hashes.
 */
export function clusterByVisual(
  assets: Array<{ id: string; perceptualHash?: string }>,
  options: ClusteringOptions = {}
): ImageCluster[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const clusters: ImageCluster[] = [];
  
  // Filter assets with hashes
  const assetsWithHashes = assets.filter((a) => a.perceptualHash);
  
  if (assetsWithHashes.length === 0) return clusters;
  
  const visited = new Set<string>();
  
  for (const asset of assetsWithHashes) {
    if (visited.has(asset.id)) continue;
    if (!asset.perceptualHash) continue;
    
    const clusterAssetIds: string[] = [asset.id];
    visited.add(asset.id);
    
    // Find visually similar assets
    for (const other of assetsWithHashes) {
      if (visited.has(other.id)) continue;
      if (!other.perceptualHash) continue;
      
      const similarity = compareHashes(asset.perceptualHash, other.perceptualHash);
      
      if (similarity >= opts.visualSimilarityThreshold!) {
        clusterAssetIds.push(other.id);
        visited.add(other.id);
      }
    }
    
    if (clusterAssetIds.length >= opts.minClusterSize!) {
      clusters.push({
        id: `visual-cluster-${clusters.length}`,
        assetIds: clusterAssetIds,
        clusterType: "visual",
        avgQualityScore: 0,
        representativeAssetId: asset.id,
      });
    }
  }
  
  return clusters;
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
 * Combined clustering strategy that prioritizes time, then location, then visual.
 */
export function clusterImages(
  assets: Array<{
    id: string;
    timestamp?: string;
    createdAt: Date;
    gpsLatitude?: number;
    gpsLongitude?: number;
    perceptualHash?: string;
  }>,
  imageScores: Map<string, ImageScore>,
  options: ClusteringOptions = {}
): ImageCluster[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const clusters: ImageCluster[] = [];
  const assignedAssetIds = new Set<string>();
  
  // Try time clustering first
  const timeClusters = clusterByTime(assets, opts);
  for (const cluster of timeClusters) {
    cluster.assetIds.forEach((id) => assignedAssetIds.add(id));
    
    // Calculate average quality score
    const scores = cluster.assetIds.map((id) => imageScores.get(id)?.qualityScore || 50);
    cluster.avgQualityScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    
    // Select representative asset (highest quality)
    const sortedByQuality = cluster.assetIds.sort(
      (a, b) => (imageScores.get(b)?.qualityScore || 0) - (imageScores.get(a)?.qualityScore || 0)
    );
    cluster.representativeAssetId = sortedByQuality[0];
    
    clusters.push(cluster);
  }
  
  // Cluster remaining assets by location
  const unassignedAssets = assets.filter((a) => !assignedAssetIds.has(a.id));
  const locationClusters = clusterByLocation(unassignedAssets, opts);
  for (const cluster of locationClusters) {
    cluster.assetIds.forEach((id) => assignedAssetIds.add(id));
    
    const scores = cluster.assetIds.map((id) => imageScores.get(id)?.qualityScore || 50);
    cluster.avgQualityScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    
    const sortedByQuality = cluster.assetIds.sort(
      (a, b) => (imageScores.get(b)?.qualityScore || 0) - (imageScores.get(a)?.qualityScore || 0)
    );
    cluster.representativeAssetId = sortedByQuality[0];
    
    clusters.push(cluster);
  }
  
  // Cluster remaining assets by visual similarity
  const stillUnassigned = assets.filter((a) => !assignedAssetIds.has(a.id));
  const visualClusters = clusterByVisual(stillUnassigned, opts);
  for (const cluster of visualClusters) {
    cluster.assetIds.forEach((id) => assignedAssetIds.add(id));
    
    const scores = cluster.assetIds.map((id) => imageScores.get(id)?.qualityScore || 50);
    cluster.avgQualityScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    
    const sortedByQuality = cluster.assetIds.sort(
      (a, b) => (imageScores.get(b)?.qualityScore || 0) - (imageScores.get(a)?.qualityScore || 0)
    );
    cluster.representativeAssetId = sortedByQuality[0];
    
    clusters.push(cluster);
  }
  
  // Remaining assets become single-item clusters
  const finalUnassigned = assets.filter((a) => !assignedAssetIds.has(a.id));
  for (const asset of finalUnassigned) {
    clusters.push({
      id: `single-cluster-${asset.id}`,
      assetIds: [asset.id],
      clusterType: "mixed",
      avgQualityScore: imageScores.get(asset.id)?.qualityScore || 50,
      representativeAssetId: asset.id,
    });
  }
  
  // Sort clusters by average quality (highest first)
  return clusters.sort((a, b) => b.avgQualityScore - a.avgQualityScore);
}

/**
 * Extract clustering data from Vionto assets.
 */
export function extractClusteringData(
  assets: Array<{
    id: string;
    metadata: unknown;
    createdAt: Date;
  }>
): Array<{
  id: string;
  timestamp?: string;
  createdAt: Date;
  gpsLatitude?: number;
  gpsLongitude?: number;
  perceptualHash?: string;
}> {
  return assets.map((asset) => {
    const metadata = asset.metadata as Record<string, unknown> | null;
    const exif = metadata?.exif as ExifData | null || metadata as ExifData | null;
    
    return {
      id: asset.id,
      timestamp: exif?.timestamp,
      createdAt: asset.createdAt,
      gpsLatitude: exif?.gpsLatitude,
      gpsLongitude: exif?.gpsLongitude,
      perceptualHash: (metadata?.perceptualHash as string) || undefined,
    };
  });
}
