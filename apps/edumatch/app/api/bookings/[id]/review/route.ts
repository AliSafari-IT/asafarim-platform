import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { leaveReview, reviewSchema } from "@/lib/server/learning-journey";

export const runtime = "nodejs";

/**
 * POST /api/bookings/[id]/review
 *
 * A verified review. "Verified" is structural rather than a flag: the service
 * only accepts a COMPLETED booking that belongs to the caller, and the unique
 * constraint on bookingId means one review per lesson.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const review = await leaveReview(id, user.id, parsed.data);
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    return handleBriefError("bookings/review", error);
  }
}
