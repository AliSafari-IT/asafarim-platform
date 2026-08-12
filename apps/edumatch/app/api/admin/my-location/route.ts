import { NextResponse } from "next/server";
import { listUserLocations } from "@asafarim/auth";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";

export const runtime = "nodejs";

/**
 * GET /api/admin/my-location
 *
 * Returns the signed-in admin's saved lat/lng (primary address first, falling
 * back to the first address that has coordinates), for prefilling the Tutor
 * Matching Debug form. Sourced from the shared platform `UserLocation` table
 * (see @asafarim/auth's locations.ts) — the same one the Hub profile page
 * (apps/hub, /profile → Addresses → "Use my location") writes to.
 */
export async function GET() {
  try {
    const { user } = await requireRole("ADMIN");

    const locations = await listUserLocations(user.id);
    const located = locations.find((l) => l.lat != null && l.lng != null);

    if (!located) {
      return NextResponse.json({ location: null });
    }

    return NextResponse.json({
      location: {
        lat: located.lat,
        lng: located.lng,
        label: located.label,
        city: located.city,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/my-location", error);
    }
    return serverError("admin/my-location", error);
  }
}
