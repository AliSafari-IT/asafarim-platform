import { NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { findBestTutors } from "@/lib/server/tutor-matching";

export const runtime = "nodejs";

/**
 * POST /api/admin/tutor-matching/debug
 *
 * Admin-only endpoint to test tutor matching algorithm.
 */
export async function POST(req: Request) {
  try {
    await requireRole("ADMIN");

    const body = (await req.json().catch(() => ({}))) as {
      lat?: number;
      lng?: number;
      subject?: string;
      gradeLevel?: string;
      maxDistanceKm?: number;
      preferOnline?: boolean;
      limit?: number;
    };

    const { lat, lng, subject, gradeLevel, maxDistanceKm, preferOnline, limit } = body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
    }
    if (!subject || !gradeLevel) {
      return NextResponse.json({ error: "Subject and gradeLevel required" }, { status: 400 });
    }

    const tutors = await findBestTutors({
      studentLocation: { lat, lng },
      subject,
      gradeLevel,
      maxDistanceKm: maxDistanceKm ?? 50,
      preferOnline: preferOnline ?? false,
      limit: limit ?? 20,
    });

    return NextResponse.json({ tutors });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/tutor-matching/debug", error);
    }
    return serverError("admin/tutor-matching/debug", error);
  }
}
