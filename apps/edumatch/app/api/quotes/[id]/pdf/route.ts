import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/auth";
import { generateQuotePdf } from "@/lib/server/pdf";
import { prisma } from "@asafarim/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authedUser = await requireAuth();

  const { id: quoteId } = await params;

  // Fetch quote with related data
  const quote = await prisma.eduQuote.findUnique({
    where: { id: quoteId },
    include: {
      quoteRequest: {
        include: {
          inquiry: {
            include: {
              student: { select: { name: true, email: true } },
            },
          },
        },
      },
      tutor: {
        select: { name: true, email: true },
      },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  // Verify student owns this quote
  if (quote.quoteRequest.inquiry.studentId !== authedUser.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Generate PDF
  const pdfData = {
    quoteId: quote.id,
    studentName: quote.quoteRequest.inquiry.student.name || "Student",
    tutorName: quote.tutor.name || "Tutor",
    subject: quote.quoteRequest.inquiry.subject,
    gradeLevel: quote.quoteRequest.inquiry.gradeLevel,
    hourlyRate: quote.hourlyRateCents / 100,
    estimatedHours: quote.estimatedHours,
    totalAmount: quote.totalCents / 100,
    currency: quote.currency,
    notes: quote.notes || undefined,
    availabilitySlots: quote.availabilitySlots as Array<{ day: string; time: string }>,
    createdAt: new Date(quote.createdAt).toLocaleDateString(),
    expiresAt: new Date(quote.quoteRequest.expiresAt).toLocaleDateString(),
  };

  try {
    const { url, key } = await generateQuotePdf(pdfData);

    // Update quote with PDF URL
    await prisma.eduQuote.update({
      where: { id: quoteId },
      data: { pdfUrl: url },
    });

    return NextResponse.json({ url, key });
  } catch (err) {
    console.error("[pdf] Generation failed:", err);
    return NextResponse.json(
      { error: "PDF generation failed", detail: String(err) },
      { status: 500 }
    );
  }
}
