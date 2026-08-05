import { NextResponse } from "next/server";
import { requireStudent, requireTutor } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { submitQuote, listQuotesForRequest, QuoteError } from "@/lib/server/quotes";
import { z } from "zod";

export const runtime = "nodejs";

const isoOrLocalDatetime = z
  .string()
  .min(1)
  .transform((val) => {
    // Accept datetime-local format ("2026-05-03T14:30") and full ISO strings
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) {
      return new Date(val + ":00").toISOString();
    }
    return new Date(val).toISOString();
  })
  .pipe(z.string().datetime());

const submitQuoteSchema = z.object({
  hourlyRateCents: z.number().int().min(100).max(100000),
  estimatedHours: z.number().min(0.5).max(100),
  availabilitySlots: z.array(
    z.object({
      start: isoOrLocalDatetime,
      end: isoOrLocalDatetime,
      mode: z.enum(["ONLINE", "IN_PERSON"]),
    }),
  ).min(1).max(5),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/quote-requests/[id]/quotes
 *
 * Tutor submits a quote for a quote request.
 * Body: { hourlyRateCents, estimatedHours, availabilitySlots[], notes? }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, profile } = await requireTutor();
    const { id: quoteRequestId } = await params;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = submitQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "));
    }

    const quote = await submitQuote({
      quoteRequestId,
      tutorId: user.id,
      ...parsed.data,
    });

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    if (error instanceof QuoteError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("quotes", error);
    }
    return serverError("quotes", error);
  }
}

/**
 * GET /api/quote-requests/[id]/quotes
 *
 * Student lists all quotes for their quote request.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: quoteRequestId } = await params;

    const quotes = await listQuotesForRequest(quoteRequestId, user.id);
    return NextResponse.json({ items: quotes });
  } catch (error) {
    if (error instanceof QuoteError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("quotes", error);
    }
    return serverError("quotes", error);
  }
}
