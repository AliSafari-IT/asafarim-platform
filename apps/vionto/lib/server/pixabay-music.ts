/**
 * Pixabay Music Provider
 * 
 * Fetches royalty-free music tracks from Pixabay API for use in Vionto videos.
 * API docs: https://pixabay.com/api/docs/
 */

const PIXABAY_API_URL = "https://pixabay.com/api/";
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;

export interface PixabayTrack {
  id: number;
  type: string; // "music"
  tags: string;
  url?: string; // Pixabay page URL
  pageURL?: string; // Pixabay page URL
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string; // Artist name
  userImageURL: string;
  download_url?: string; // Direct download URL if available
  duration?: number;
}

type PixabayAudioHit = {
  id: number;
  type: string;
  tags: string;
  url?: string;
  pageURL?: string;
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
  download_url?: string;
  duration?: number;
} & Record<string, unknown>;

export interface PixabayAudioResponse {
  totalHits: number;
  hits: PixabayAudioHit[];
}

export interface NormalizedTrackMetadata {
  provider: "pixabay" | "upload" | "spaces" | "common";
  trackId: string;
  title: string;
  artist: string;
  artistId: string;
  duration?: number; // Duration in seconds (if available)
  tags: string[];
  sourceUrl: string;
  downloadUrl: string;
  license: "royalty_free" | "uploaded" | "spaces" | "common";
  licenseInfo: string;
  downloads: number;
  likes: number;
  storageKey?: string; // DO Spaces / S3 key for direct download by the worker
  [key: string]: unknown; // Index signature for Prisma JSON compatibility
}

/**
 * Maps Vionto music categories to Pixabay search queries
 */
const CATEGORY_TO_QUERY: Record<string, string> = {
  calm_piano: "calm piano",
  cinematic_strings: "cinematic",
  travel_upbeat: "upbeat travel",
  family_warm_acoustic: "warm acoustic",
};

const PLAYABLE_AUDIO_URL_RE =
  /^https?:\/\/.+(?:\.(?:mp3|wav|ogg|m4a|aac)(?:[?#].*)?|\/download\/audio\/)/i;

/**
 * Fetches music tracks from Pixabay API by category
 */
export async function fetchPixabayMusicByCategory(
  category: string,
  limit: number = 10,
  query?: string
): Promise<NormalizedTrackMetadata[]> {
  if (!PIXABAY_API_KEY) {
    throw new Error("PIXABAY_API_KEY is not configured");
  }

  const searchQuery = query || CATEGORY_TO_QUERY[category];
  if (!searchQuery) {
    throw new Error(`Unknown music category: ${category}`);
  }

  const url = new URL(PIXABAY_API_URL);
  url.searchParams.set("key", PIXABAY_API_KEY);
  url.searchParams.set("q", searchQuery);
  const requestedLimit = Math.min(Math.max(limit, 1), 50);
  const fetchLimit = Math.min(Math.max(requestedLimit * 3, 20), 50);
  url.searchParams.set("per_page", String(fetchLimit));

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Pixabay API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as PixabayAudioResponse;

    // Filter to only include music type results
    const musicHits = data.hits.filter(hit => hit.type === "music");

    return musicHits
      .map(normalizePixabayTrack)
      .filter((track): track is NormalizedTrackMetadata => track !== null)
      .slice(0, requestedLimit);
  } catch (error) {
    console.error(`[pixabay-music] Failed to fetch tracks for category ${category}:`, error);
    throw error;
  }
}

/**
 * Fetches a specific track by ID from Pixabay
 */
export async function fetchPixabayTrackById(trackId: string): Promise<NormalizedTrackMetadata | null> {
  if (!PIXABAY_API_KEY) {
    throw new Error("PIXABAY_API_KEY is not configured");
  }

  const url = new URL(PIXABAY_API_URL);
  url.searchParams.set("key", PIXABAY_API_KEY);
  url.searchParams.set("id", trackId);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Pixabay API request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as PixabayAudioResponse;
    
    if (data.hits.length === 0) {
      return null;
    }

    return normalizePixabayTrack(data.hits[0]);
  } catch (error) {
    console.error(`[pixabay-music] Failed to fetch track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Normalizes Pixabay track data to Vionto's internal format
 */
function normalizePixabayTrack(hit: PixabayAudioHit): NormalizedTrackMetadata | null {
  const tags = hit.tags.split(",").map(tag => tag.trim()).filter(Boolean);
  const playableUrl = findPlayableAudioUrl(hit);
  const sourceUrl = hit.url || hit.pageURL;

  if (!sourceUrl) {
    return null;
  }
  
  return {
    provider: "pixabay",
    trackId: String(hit.id),
    title: tags[0] || "Unknown", // Pixabay doesn't provide track titles, use first tag
    artist: hit.user,
    artistId: String(hit.user_id),
    duration: hit.duration,
    tags,
    sourceUrl,
    downloadUrl: playableUrl || sourceUrl, // Fallback to source URL if no playable URL
    license: "royalty_free",
    licenseInfo: "Royalty-free music from Pixabay - Free for commercial use",
    downloads: hit.downloads,
    likes: hit.likes,
  };
}

function findPlayableAudioUrl(value: unknown, seen = new Set<object>()): string | null {
  if (typeof value === "string") {
    return PLAYABLE_AUDIO_URL_RE.test(value) ? value : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const audioUrl = findPlayableAudioUrl(item, seen);
      if (audioUrl) {
        return audioUrl;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const likelyAudioFields = [
    "download_url",
    "downloadUrl",
    "audio",
    "audio_url",
    "audioURL",
    "audioUrl",
    "preview",
    "preview_url",
    "previewURL",
    "previewUrl",
    "mp3",
    "src",
  ];

  for (const field of likelyAudioFields) {
    const audioUrl = findPlayableAudioUrl(record[field], seen);
    if (audioUrl) {
      return audioUrl;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const audioUrl = findPlayableAudioUrl(nestedValue, seen);
    if (audioUrl) {
      return audioUrl;
    }
  }

  return null;
}

/**
 * Selects a suitable track from a category based on duration preference
 * Returns the first track that matches the duration constraint, or a random track
 */
export function selectTrackByDuration(
  tracks: NormalizedTrackMetadata[],
  targetDurationSeconds?: number,
  toleranceSeconds: number = 30
): NormalizedTrackMetadata | null {
  if (tracks.length === 0) {
    return null;
  }

  if (!targetDurationSeconds) {
    // No duration preference, return the most popular track (most downloads)
    return tracks.sort((a, b) => b.downloads - a.downloads)[0];
  }

  // Try to find a track close to the target duration
  const matchingTrack = tracks.find(track => {
    if (!track.duration) return false;
    const diff = Math.abs(track.duration - targetDurationSeconds);
    return diff <= toleranceSeconds;
  });

  if (matchingTrack) {
    return matchingTrack;
  }

  // No matching duration, return the most popular track
  return tracks.sort((a, b) => b.downloads - a.downloads)[0];
}
