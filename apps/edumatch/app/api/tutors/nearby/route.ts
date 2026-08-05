import { NextResponse } from "next/server";
import { requireStudent, requireTutor } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { findNearbyTutors, scoreTutors } from "@/lib/server/tutor-matching";
import { geocodeAddress } from "@/lib/server/geocoding";
import { z } from "zod";

export const runtime = "nodejs";

const nearbySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  subject: z.string().min(1).max(50),
  gradeLevel: z.string().min(1).max(20),
  maxDistanceKm: z.number().min(1).max(200).default(50),
  preferOnline: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/tutors/nearby?lat=&lng=&subject=&gradeLevel=&maxDistanceKm=
 *
 * Find tutors within radius using PostGIS spatial queries.
 * Students use this to preview available tutors before creating a quote request.
 *
 * Query params:
 *   lat, lng (required): search center coordinates
 *   subject (required): subject to match
 *   gradeLevel (required): grade level to match
 *   maxDistanceKm (optional, default 50): search radius
 *   preferOnline (optional, default false): prefer online-capable tutors
 *   limit (optional, default 20): max results
 */
export async function GET(req: Request) {
  try {
    await requireStudent(); // Must be authenticated student

    const { searchParams } = new URL(req.url);
    const raw = {
      lat: searchParams.get("lat"),
      lng: searchParams.get("lng"),
      subject: searchParams.get("subject"),
      gradeLevel: searchParams.get("gradeLevel"),
      maxDistanceKm: searchParams.get("maxDistanceKm"),
      preferOnline: searchParams.get("preferOnline"),
      limit: searchParams.get("limit"),
    };

    // Parse and validate
    const parsed = nearbySchema.safeParse({
      lat: raw.lat ? parseFloat(raw.lat) : undefined,
      lng: raw.lng ? parseFloat(raw.lng) : undefined,
      subject: raw.subject ?? undefined,
      gradeLevel: raw.gradeLevel ?? undefined,
      maxDistanceKm: raw.maxDistanceKm ? parseFloat(raw.maxDistanceKm) : undefined,
      preferOnline: raw.preferOnline === "true",
      limit: raw.limit ? parseInt(raw.limit, 10) : undefined,
    });

    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "));
    }

    const tutors = await findNearbyTutors({
      studentLocation: { lat: parsed.data.lat, lng: parsed.data.lng },
      subject: parsed.data.subject,
      gradeLevel: parsed.data.gradeLevel,
      maxDistanceKm: parsed.data.maxDistanceKm,
      preferOnline: parsed.data.preferOnline,
      limit: parsed.data.limit,
    });
    const scored = scoreTutors(
      tutors,
      parsed.data.subject,
      parsed.data.gradeLevel,
      parsed.data.preferOnline,
    );

    return NextResponse.json({
      items: scored,
      total: scored.length,
      search: {
        center: { lat: parsed.data.lat, lng: parsed.data.lng },
        radiusKm: parsed.data.maxDistanceKm,
        subject: parsed.data.subject,
        gradeLevel: parsed.data.gradeLevel,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutors/nearby", error);
    }
    return serverError("tutors/nearby", error);
  }
}

/**
 * POST /api/tutors/nearby
 *
 * Alternative endpoint that accepts address instead of lat/lng.
 * Geocodes the address first, then searches.
 */
export async function POST(req: Request) {
  try {
    await requireStudent();

    const body = (await req.json().catch(() => ({}))) as {
      address?: string;
      subject?: string;
      gradeLevel?: string;
      maxDistanceKm?: number;
      preferOnline?: boolean;
      limit?: number;
    };

    if (!body.address) {
      return badRequest("Provide address to geocode.");
    }

    const geocoded = await geocodeAddress(body.address);
    if (!geocoded) {
      return NextResponse.json(
        { error: "Geocoding unavailable. Set GOOGLE_MAPS_API_KEY." },
        { status: 503 },
      );
    }
    if ("error" in geocoded) {
      return badRequest(geocoded.error);
    }

    const params = nearbySchema.parse({
      lat: geocoded.location.lat,
      lng: geocoded.location.lng,
      subject: body.subject ?? "General",
      gradeLevel: body.gradeLevel ?? "K12",
      maxDistanceKm: body.maxDistanceKm,
      preferOnline: body.preferOnline,
      limit: body.limit,
    });

    const tutors = await findNearbyTutors({
      studentLocation: { lat: params.lat, lng: params.lng },
      subject: params.subject,
      gradeLevel: params.gradeLevel,
      maxDistanceKm: params.maxDistanceKm,
      preferOnline: params.preferOnline,
      limit: params.limit,
    });
    const scored = scoreTutors(tutors, params.subject, params.gradeLevel, params.preferOnline);

    return NextResponse.json({
      items: scored,
      total: scored.length,
      search: {
        address: geocoded.formattedAddress,
        center: geocoded.location,
        radiusKm: params.maxDistanceKm,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutors/nearby", error);
    }
    return serverError("tutors/nearby", error);
  }
}
