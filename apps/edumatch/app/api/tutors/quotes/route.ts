import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * GET /api/tutors/quotes
 *
 * List all quotes submitted by the authenticated tutor.
 */
export async function GET() {
  try {
    const { user } = await requireTutor();

    const quotes = await prisma.eduQuote.findMany({
      where: { tutorId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        quoteRequest: {
          include: {
            inquiry: {
              select: { subject: true, gradeLevel: true, description: true },
            },
          },
        },
      },
    });

    const items = quotes.map((q) => ({
      id: q.id,
      status: q.status,
      hourlyRateCents: q.hourlyRateCents,
      estimatedHours: q.estimatedHours,
      totalCents: q.hourlyRateCents * q.estimatedHours,
      notes: q.notes,
      createdAt: q.createdAt,
      subject: q.quoteRequest.inquiry.subject,
      gradeLevel: q.quoteRequest.inquiry.gradeLevel,
      description: q.quoteRequest.inquiry.description,
      quoteRequestId: q.quoteRequestId,
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutors/quotes", error);
    }
    return serverError("tutors/quotes", error);
  }
}
