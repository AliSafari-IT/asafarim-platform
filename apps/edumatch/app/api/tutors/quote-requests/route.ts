import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { listAvailableQuoteRequestsForTutor, QuoteError } from "@/lib/server/quotes";
import { geocodeAddress } from "@/lib/server/geocoding";

export const runtime = "nodejs";

/**
 * GET /api/tutors/quote-requests?lat=&lng=&maxDistanceKm=
 *
 * Tutor views available quote requests matching their expertise and location.
 * Only returns OPEN requests that haven't expired.
 */
export async function GET(req: Request) {
  try {
    const { user, profile } = await requireTutor();

    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const maxDistanceKm = parseInt(searchParams.get("maxDistanceKm") ?? "50", 10);

    // Resolve tutor location: query params → profile lat/lng → geocode homeAddress
    let location: { lat: number; lng: number } | null = null;

    if (lat && lng) {
      location = { lat: parseFloat(lat), lng: parseFloat(lng) };
    } else if (profile.homeLat != null && profile.homeLng != null) {
      location = { lat: profile.homeLat, lng: profile.homeLng };
    } else if (profile.homeAddress) {
      const addr = profile.homeAddress as { formatted?: string } | null;
      if (addr?.formatted) {
        const geocoded = await geocodeAddress(addr.formatted);
        if (geocoded && !("error" in geocoded)) {
          location = geocoded.location;
        }
      }
    }

    const requests = await listAvailableQuoteRequestsForTutor(user.id, location, maxDistanceKm);

    return NextResponse.json({
      items: requests,
      total: requests.length,
      tutorSubjects: profile.subjectsTaught,
      location,
    });
  } catch (error) {
    if (error instanceof QuoteError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutors/quote-requests", error);
    }
    return serverError("tutors/quote-requests", error);
  }
}
