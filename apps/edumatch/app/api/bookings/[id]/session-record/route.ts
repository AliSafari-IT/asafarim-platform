import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { requireTutor, requireStudentAutoProvision } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { recordSession, sessionRecordSchema } from "@/lib/server/learning-journey";

export const runtime = "nodejs";

/**
 * POST /api/bookings/[id]/session-record
 *
 * The tutor records what happened. Upsert, because notes get finished later.
 * An ATTENDED record also completes the booking — a lesson that was taught and
 * written up is a completed lesson, and that is what the North Star metric
 * ("completed trusted learning sessions") counts.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTutor();
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = sessionRecordSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const record = await recordSession(id, user.id, parsed.data);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return handleBriefError("bookings/session-record", error);
  }
}

/**
 * GET /api/bookings/[id]/session-record
 *
 * Readable by either party to the booking. The student sees their summary,
 * homework, and next step; the tutor additionally sees their own private
 * notes, which are never returned to the student.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireStudentAutoProvision();

    const record = await prisma.eduSessionRecord.findFirst({
      where: { bookingId: id, OR: [{ studentId: user.id }, { tutorId: user.id }] },
    });
    if (!record) {
      return NextResponse.json({ record: null });
    }

    const isTutor = record.tutorId === user.id;
    return NextResponse.json({
      record: {
        id: record.id,
        attendance: record.attendance,
        topicsCovered: record.topicsCovered,
        studentSummary: record.studentSummary,
        homework: record.homework,
        nextStep: record.nextStep,
        resources: record.resources,
        goalProgress: record.goalProgress,
        openConcerns: record.openConcerns,
        createdAt: record.createdAt,
        ...(isTutor ? { tutorNotes: record.tutorNotes } : {}),
      },
    });
  } catch (error) {
    return handleBriefError("bookings/session-record", error);
  }
}
