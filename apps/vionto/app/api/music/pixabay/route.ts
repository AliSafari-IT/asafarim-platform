import { NextResponse } from "next/server";
import { fetchPixabayMusicByCategory, fetchPixabayTrackById } from "@/lib/server/pixabay-music";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set([
  "calm_piano",
  "cinematic_strings",
  "travel_upbeat",
  "family_warm_acoustic",
]);

/**
 * GET /api/music/pixabay
 * 
 * Query parameters:
 * - category: Music category to fetch tracks for (calm_piano, cinematic_strings, travel_upbeat, family_warm_acoustic)
 * - trackId: Optional specific track ID to fetch
 * - limit: Number of tracks to return (default: 10)
 * - query: Optional search query for track name or artist
 * - minDuration: Optional minimum duration in seconds
 * - maxDuration: Optional maximum duration in seconds
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const trackId = searchParams.get("trackId");
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const safeLimit = isNaN(limit) ? 10 : limit;
    const query = searchParams.get("query") || undefined;
    const minDuration = searchParams.get("minDuration");
    const maxDuration = searchParams.get("maxDuration");

    if (trackId) {
      // Fetch a specific track by ID
      const track = await fetchPixabayTrackById(trackId);
      if (!track) {
        return NextResponse.json(
          { error: "Track not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ track });
    }

    if (!category) {
      return NextResponse.json(
        { error: "category query parameter is required" },
        { status: 400 }
      );
    }

    if (!VALID_CATEGORIES.has(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${Array.from(VALID_CATEGORIES).join(", ")}` },
        { status: 400 }
      );
    }

    if (safeLimit < 1 || safeLimit > 50) {
      return NextResponse.json(
        { error: "limit must be between 1 and 50" },
        { status: 400 }
      );
    }

    const tracks = await fetchPixabayMusicByCategory(category, safeLimit, query);
    
    // Filter by duration if specified
    let filteredTracks = tracks;
    if (minDuration || maxDuration) {
      const min = minDuration ? parseInt(minDuration, 10) : undefined;
      const max = maxDuration ? parseInt(maxDuration, 10) : undefined;
      filteredTracks = tracks.filter(track => {
        if (!track.duration) return false;
        if (min !== undefined && !isNaN(min) && track.duration < min) return false;
        if (max !== undefined && !isNaN(max) && track.duration > max) return false;
        return true;
      });
    }
    
    return NextResponse.json({ tracks: filteredTracks, category });
  } catch (error) {
    console.error("[api/music/pixabay] Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch music tracks";
    
    // Check if it's a configuration error
    if (errorMessage.includes("PIXABAY_API_KEY")) {
      return NextResponse.json(
        { error: "Pixabay API is not configured" },
        { status: 500 }
      );
    }

    // Return more detailed error for debugging
    return NextResponse.json(
      { error: errorMessage, details: error instanceof Error ? error.stack : undefined },
      { status: 500 }
    );
  }
}
