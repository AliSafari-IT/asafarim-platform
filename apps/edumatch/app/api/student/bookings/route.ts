import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user } = await requireStudent();

    const bookings = await prisma.eduBooking.findMany({
      where: { studentId: user.id },
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
        tutor: {
          select: { name: true },
        },
        transactions: {
          where: { type: "REFUND" },
          select: { id: true, grossCents: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const items = bookings.map((b) => ({
      id: b.id,
      status: b.status,
      scheduledAt: b.scheduledAt,
      durationMinutes: b.durationMinutes,
      mode: b.mode,
      totalCents: b.quote.totalCents,
      subject: b.quote.quoteRequest.inquiry.subject,
      gradeLevel: b.quote.quoteRequest.inquiry.gradeLevel,
      tutorName: b.tutor.name,
      disputeNotes: b.cancellationReason,
      refundRecorded: b.transactions.length > 0,
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("student/bookings", error);
    }
    return serverError("student/bookings", error);
  }
}
