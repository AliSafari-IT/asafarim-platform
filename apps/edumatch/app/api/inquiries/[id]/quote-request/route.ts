import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { createQuoteRequest, QuoteError } from "@/lib/server/quotes";
import { findBestTutors } from "@/lib/server/tutor-matching";
import { geocodeAddress } from "@/lib/server/geocoding";
import { notifyTutorsOfQuoteRequest } from "@/lib/server/notifications";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * GET /api/inquiries/[id]/quote-request
 *
 * Return the most recent quote request for this inquiry (student only).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: inquiryId } = await params;

    const quoteRequest = await prisma.eduQuoteRequest.findFirst({
      where: { inquiryId, studentId: user.id },
      orderBy: { requestedAt: "desc" },
      select: { id: true, status: true, expiresAt: true, requestedAt: true },
    });

    if (!quoteRequest) {
      return NextResponse.json({ quoteRequest: null });
    }

    return NextResponse.json({ quoteRequest });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("quote-request", error);
    }
    return serverError("quote-request", error);
  }
}

/**
 * POST /api/inquiries/[id]/quote-request
 *
 * Student requests quotes for their inquiry. This:
 * 1. Creates a quote request record
 * 2. Finds matching tutors using PostGIS spatial queries
 * 3. Returns the quote request + matched tutors
 *
 * Body: { studentLocation?: { lat, lng }, address?: string, preferOnline?: boolean }
 * - Provide either studentLocation (lat/lng) or address (to geocode)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: inquiryId } = await params;

    const inquiry = await prisma.eduInquiry.findFirst({
      where: { id: inquiryId, studentId: user.id },
      select: { id: true, subject: true, gradeLevel: true, status: true, attachments: true },
    });
    if (!inquiry) {
      return badRequest("Inquiry not found.");
    }

    const body = (await req.json().catch(() => ({}))) as {
      studentLocation?: { lat: number; lng: number };
      address?: string;
      preferOnline?: boolean;
      maxDistanceKm?: number;
    };

    // Resolve location: explicit coords > geocoded address > student profile > error
    let location = body.studentLocation;

    if (!location && body.address) {
      const geocoded = await geocodeAddress(body.address);
      if (!geocoded) {
        return NextResponse.json(
          { error: "Geocoding unavailable. Set GOOGLE_MAPS_API_KEY or provide studentLocation." },
          { status: 503 },
        );
      }
      if ("error" in geocoded) {
        return badRequest(geocoded.error);
      }
      location = geocoded.location;
    }

    // Fallback to student's profile location if available
    if (!location) {
      const studentProfile = await prisma.eduStudentProfile.findUnique({
        where: { userId: user.id },
        select: { homeLat: true, homeLng: true },
      });
      if (studentProfile?.homeLat && studentProfile?.homeLng) {
        location = { lat: studentProfile.homeLat, lng: studentProfile.homeLng };
      }
    }

    if (!location) {
      return badRequest("Provide studentLocation {lat,lng} or address to geocode, or set your home location in your student profile.");
    }

    // Create quote request
    const quoteRequest = await createQuoteRequest({
      inquiryId,
      studentId: user.id,
      expiresInHours: 48,
    });

    // Find matching tutors
    const tutors = await findBestTutors({
      studentLocation: location,
      subject: inquiry.subject,
      gradeLevel: inquiry.gradeLevel,
      maxDistanceKm: body.maxDistanceKm ?? 50,
      preferOnline: body.preferOnline ?? false,
      limit: 20,
    });

    // Fire-and-forget: notify matched tutors
    if (tutors.length > 0) {
      void notifyTutorsOfQuoteRequest({
        tutorIds: tutors.map((t) => t.userId),
        quoteRequestId: quoteRequest.id,
        subject: inquiry.subject,
        gradeLevel: inquiry.gradeLevel,
      });
    }

    return NextResponse.json({
      quoteRequest,
      matchedTutors: tutors,
      totalMatched: tutors.length,
      locationUsed: location,
    });
  } catch (error) {
    if (error instanceof QuoteError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("quote-request", error);
    }
    return serverError("quote-request", error);
  }
}
