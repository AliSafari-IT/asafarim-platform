import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * GET /api/tutors/bookings
 *
 * List all bookings for the authenticated tutor.
 */
export async function GET() {
  try {
    const { user } = await requireTutor();

    const bookings = await prisma.eduBooking.findMany({
      where: { tutorId: user.id },
      orderBy: { scheduledAt: "desc" },
      include: {
        quote: {
          include: {
            quoteRequest: {
              include: {
                inquiry: {
                  select: { subject: true, gradeLevel: true },
                },
              },
            },
          },
        },
        student: {
          select: { name: true },
        },
        transactions: {
          where: { type: "REFUND" },
          select: { id: true },
        },
      },
    });

    const items = bookings.map((b) => ({
      id: b.id,
      status: b.status,
      scheduledAt: b.scheduledAt,
      durationMinutes: b.durationMinutes,
      mode: b.mode,
      totalCents: b.quote.hourlyRateCents * b.quote.estimatedHours,
      subject: b.quote.quoteRequest.inquiry.subject,
      gradeLevel: b.quote.quoteRequest.inquiry.gradeLevel,
      studentName: b.student.name,
      disputeNotes: b.cancellationReason,
      refundRecorded: b.transactions.length > 0,
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutors/bookings", error);
    }
    return serverError("tutors/bookings", error);
  }
}
