/**
 * Phase 3 — Quote request and standardized quote management.
 *
 * - Students request quotes for their inquiries
 * - Matching tutors are notified/invited
 * - Tutors submit standardized quotes with pricing and availability
 * - Students accept/decline quotes
 */

import { prisma } from "@asafarim/db";
import type { AvailabilitySlot } from "./tutor-matching";
import { signAttachments, type AttachmentView } from "./storage";

export type QuoteRequestInput = {
  inquiryId: string;
  studentId: string;
  expiresInHours?: number;
};

export type QuoteInput = {
  quoteRequestId: string;
  tutorId: string;
  hourlyRateCents: number;
  estimatedHours: number;
  availabilitySlots: AvailabilitySlot[];
  notes?: string;
};

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

/**
 * Create a quote request for an inquiry.
 * Transitions inquiry status from AI_RESPONDED → TUTOR_REQUESTED.
 */
export async function createQuoteRequest(
  input: QuoteRequestInput,
): Promise<{ id: string; status: string; expiresAt: Date }> {
  const { inquiryId, studentId, expiresInHours = 48 } = input;

  // Verify inquiry exists and belongs to student
  const inquiry = await prisma.eduInquiry.findFirst({
    where: { id: inquiryId, studentId },
    select: { id: true, status: true },
  });
  if (!inquiry) {
    throw new QuoteError("Inquiry not found or access denied.");
  }

  // Can only request quotes if AI has responded or status is still NEW
  if (!["NEW", "AI_RESPONDED"].includes(inquiry.status)) {
    throw new QuoteError(`Cannot request quotes for inquiry with status: ${inquiry.status}`);
  }

  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 48) * 60 * 60 * 1000);

  // Use transaction to create quote request + update inquiry status
  const result = await prisma.$transaction(async (tx) => {
    const quoteRequest = await tx.eduQuoteRequest.create({
      data: {
        inquiryId: input.inquiryId,
        studentId: input.studentId,
        expiresAt,
        status: "OPEN",
      },
    });

    await tx.eduInquiry.update({
      where: { id: input.inquiryId },
      data: { status: "TUTOR_REQUESTED" },
    });

    return quoteRequest;
  });

  return {
    id: result.id,
    status: result.status,
    expiresAt: result.expiresAt,
  };
}

/**
 * Submit a quote from a tutor.
 * Validates the tutor is eligible to quote on this request.
 */
export async function submitQuote(
  input: QuoteInput,
): Promise<{ id: string; totalCents: number; status: string; eligible: boolean }> {
  // Verify quote request exists and is open
  const quoteRequest = await prisma.eduQuoteRequest.findUnique({
    where: { id: input.quoteRequestId },
    include: { inquiry: { select: { subject: true, gradeLevel: true } } },
  });

  if (!quoteRequest) {
    throw new QuoteError("Quote request not found.");
  }
  if (quoteRequest.status !== "OPEN") {
    throw new QuoteError(`Quote request is ${quoteRequest.status.toLowerCase()}.`);
  }
  if (quoteRequest.expiresAt < new Date()) {
    throw new QuoteError("Quote request has expired.");
  }

  // Verify tutor exists and is active
  const tutor = await prisma.eduTutorProfile.findUnique({
    where: { userId: input.tutorId },
    select: { userId: true, subjectsTaught: true, levelsTaught: true },
  });
  if (!tutor) {
    throw new QuoteError("Tutor profile not found.");
  }

  // Validate tutor can teach this subject/level (soft check, allows override)
  const canTeachSubject = tutor.subjectsTaught.some(
    (s) => s.toLowerCase() === quoteRequest.inquiry.subject.toLowerCase(),
  );
  const canTeachLevel = tutor.levelsTaught.some(
    (l) => l.toLowerCase() === quoteRequest.inquiry.gradeLevel.toLowerCase(),
  );

  // Calculate total
  const totalCents = Math.round(input.hourlyRateCents * input.estimatedHours);

  // Check for existing quote from this tutor
  const existing = await prisma.eduQuote.findUnique({
    where: {
      quoteRequestId_tutorId: {
        quoteRequestId: input.quoteRequestId,
        tutorId: input.tutorId,
      },
    },
  });

  if (existing) {
    throw new QuoteError("You have already submitted a quote for this request.");
  }

  const quote = await prisma.eduQuote.create({
    data: {
      quoteRequestId: input.quoteRequestId,
      tutorId: input.tutorId,
      hourlyRateCents: input.hourlyRateCents,
      estimatedHours: input.estimatedHours,
      totalCents,
      availabilitySlots: input.availabilitySlots as unknown as object,
      notes: input.notes ?? null,
      status: "PENDING",
    },
  });

  return {
    id: quote.id,
    totalCents: quote.totalCents,
    status: quote.status,
    eligible: canTeachSubject && canTeachLevel,
  };
}

/**
 * Student accepts a quote.
 * Creates a booking placeholder and updates statuses.
 */
export async function acceptQuote(
  quoteId: string,
  studentId: string,
): Promise<{ bookingId: string; quoteId: string }> {
  // Ownership is part of the query itself (not a follow-up check) so a
  // quote belonging to another student is indistinguishable from a quote
  // that doesn't exist — same "not found" either way (see #87 AC5).
  const quote = await prisma.eduQuote.findFirst({
    where: { id: quoteId, quoteRequest: { studentId } },
    include: {
      quoteRequest: { select: { studentId: true, inquiryId: true, status: true } },
    },
  });

  if (!quote) {
    throw new QuoteError("Quote not found.");
  }
  if (quote.status !== "PENDING") {
    throw new QuoteError(`Quote cannot be accepted (status: ${quote.status}).`);
  }
  if (quote.quoteRequest.status !== "OPEN") {
    throw new QuoteError("Quote request is no longer open.");
  }

  // Transaction: accept quote, decline others, mark request fulfilled, create booking
  const result = await prisma.$transaction(async (tx) => {
    // Accept this quote
    await tx.eduQuote.update({
      where: { id: quoteId },
      data: { status: "ACCEPTED", updatedAt: new Date() },
    });

    // Decline other quotes for this request
    await tx.eduQuote.updateMany({
      where: { quoteRequestId: quote.quoteRequestId, id: { not: quoteId } },
      data: { status: "DECLINED", updatedAt: new Date() },
    });

    // Mark request as fulfilled
    await tx.eduQuoteRequest.update({
      where: { id: quote.quoteRequestId },
      data: { status: "FULFILLED" },
    });

    // Mark inquiry as booked
    await tx.eduInquiry.update({
      where: { id: quote.quoteRequest.inquiryId },
      data: { status: "BOOKED" },
    });

    // Create booking
    const booking = await tx.eduBooking.create({
      data: {
        studentId: quote.quoteRequest.studentId,
        tutorId: quote.tutorId,
        quoteId: quote.id,
        scheduledAt: new Date(), // Placeholder; should use selected slot
        durationMinutes: Math.round(quote.estimatedHours * 60),
        mode: "ONLINE", // Default; could be derived from quote slots
        status: "SCHEDULED",
      },
    });

    return { bookingId: booking.id, quoteId: quote.id };
  });

  return result;
}

/**
 * Student declines a quote.
 */
export async function declineQuote(quoteId: string, studentId: string): Promise<void> {
  const quote = await prisma.eduQuote.findFirst({
    where: { id: quoteId, quoteRequest: { studentId } },
    include: { quoteRequest: { select: { studentId: true } } },
  });

  if (!quote) throw new QuoteError("Quote not found.");
  if (quote.status !== "PENDING") throw new QuoteError("Quote cannot be declined.");

  await prisma.eduQuote.update({
    where: { id: quoteId },
    data: { status: "DECLINED", updatedAt: new Date() },
  });
}

/**
 * List quotes for a student's quote request.
 */
export async function listQuotesForRequest(
  quoteRequestId: string,
  studentId: string,
) {
  const qr = await prisma.eduQuoteRequest.findFirst({
    where: { id: quoteRequestId, studentId },
    include: {
      quotes: {
        include: {
          tutor: {
            select: {
              id: true,
              name: true,
              image: true,
              eduTutorProfile: {
                select: {
                  bio: true,
                  ratingAvg: true,
                  ratingCount: true,
                  verifiedAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!qr) throw new QuoteError("Quote request not found.");
  return qr.quotes;
}

/**
 * List quote requests for a student.
 */
export async function listStudentQuoteRequests(studentId: string) {
  return prisma.eduQuoteRequest.findMany({
    where: { studentId },
    include: {
      inquiry: { select: { subject: true, gradeLevel: true, description: true } },
      quotes: {
        select: { id: true, status: true, totalCents: true, tutorId: true },
      },
    },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * Haversine distance in km between two lat/lng points.
 * Used as a fallback when PostGIS is not available.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * List available quote requests for a tutor (matching their expertise + location).
 * Uses plain lat/lng columns (PostGIS not installed).
 */
export async function listAvailableQuoteRequestsForTutor(
  tutorId: string,
  location: { lat: number; lng: number } | null,
  maxDistanceKm: number = 50,
) {
  const tutor = await prisma.eduTutorProfile.findUnique({
    where: { userId: tutorId },
    select: { subjectsTaught: true, levelsTaught: true, onlineOnly: true },
  });
  if (!tutor) throw new QuoteError("Tutor profile not found.");

  // Fetch all open, non-expired requests with student location. Brief-driven
  // requests are invite-only (see EduQuoteRequest.briefId doc comment) and
  // must never appear on this open marketplace board — those tutors are
  // notified separately via /tutor/invites.
  const openRequests = await prisma.eduQuoteRequest.findMany({
    where: {
      status: "OPEN",
      expiresAt: { gt: new Date() },
      briefId: null,
    },
    orderBy: { requestedAt: "desc" },
    take: 200,
    include: {
      inquiry: {
        select: {
          id: true,
          subject: true,
          gradeLevel: true,
          description: true,
          attachments: true,
          studentId: true,
        },
      },
    },
  });

  // Filter by subject match. Bidirectional substring match so e.g. a tutor
  // teaching "Mathematics" still matches a request for "Math", and a tutor
  // teaching "English" matches "English Literature".
  const subjectsLower = tutor.subjectsTaught.map((s) => s.toLowerCase());
  const subjectMatched = tutor.subjectsTaught.length === 0
    ? openRequests
    : openRequests.filter((r) => {
        const reqSubject = r.inquiry.subject.toLowerCase();
        return subjectsLower.some(
          (s) => reqSubject.includes(s) || s.includes(reqSubject),
        );
      });

  // Fetch student profiles for location filtering
  const studentIds = [...new Set(subjectMatched.map((r) => r.inquiry.studentId))];
  const studentProfiles = await prisma.eduStudentProfile.findMany({
    where: { userId: { in: studentIds } },
    select: { userId: true, homeLat: true, homeLng: true },
  });
  const profileMap = new Map(studentProfiles.map((p) => [p.userId, p]));

  // Filter by distance and compute distanceKm
  const results: Array<{
    id: string;
    inquiryId: string;
    subject: string;
    gradeLevel: string;
    description: string;
    attachments: AttachmentView[];
    requestedAt: Date;
    expiresAt: Date;
    distanceKm: number;
  }> = [];

  for (const req of subjectMatched) {
    const sp = profileMap.get(req.inquiry.studentId);

    let distanceKm = 0;
    if (location && sp?.homeLat != null && sp?.homeLng != null) {
      distanceKm = Math.round(haversineKm(location.lat, location.lng, sp.homeLat, sp.homeLng) * 10) / 10;
    }

    // Skip if tutor is location-bound, both locations are known, and student is too far
    if (location && !tutor.onlineOnly && sp?.homeLat != null && distanceKm > maxDistanceKm) {
      continue;
    }

    results.push({
      id: req.id,
      inquiryId: req.inquiryId,
      subject: req.inquiry.subject,
      gradeLevel: req.inquiry.gradeLevel,
      description: req.inquiry.description,
      attachments: await signAttachments(req.inquiry.attachments),
      requestedAt: req.requestedAt,
      expiresAt: req.expiresAt,
      distanceKm,
    });
  }

  return results.slice(0, 50);
}
