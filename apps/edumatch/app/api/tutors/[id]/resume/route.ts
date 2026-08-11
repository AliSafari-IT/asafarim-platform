import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { notFound, serverError } from "@/lib/server";
import { getTutorResume } from "@/lib/server/tutor-resume";

export const runtime = "nodejs";

/**
 * GET /api/tutors/[id]/resume
 *
 * Public, read-only. No auth required — this is the same information the
 * compare cards already summarize, just the full version. Never returns
 * studentId/name for recentReviews (see getTutorResume()).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const profile = await prisma.eduTutorProfile.findUnique({
      where: { userId: id },
      select: {
        bio: true,
        subjectsTaught: true,
        levelsTaught: true,
        teachingStyle: true,
        verifiedAt: true,
        user: { select: { name: true, image: true } },
      },
    });
    if (!profile) return notFound();

    const resume = await getTutorResume(id);
    return NextResponse.json({
      tutorId: id,
      name: profile.user.name,
      image: profile.user.image,
      bio: profile.bio,
      subjectsTaught: profile.subjectsTaught,
      levelsTaught: profile.levelsTaught,
      teachingStyle: profile.teachingStyle,
      verified: profile.verifiedAt !== null,
      resume,
    });
  } catch (error) {
    return serverError("tutors/[id]/resume", error);
  }
}
