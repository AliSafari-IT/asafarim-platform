import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";
import { getLearningJourney } from "@/lib/server/learning-journey";

export const runtime = "nodejs";

/**
 * GET /api/student/journey
 *
 * The student's learning record: session history, what was covered, homework,
 * next steps, and the patterns across them. This is the surface that makes the
 * platform a companion rather than a checkout.
 */
export async function GET() {
  try {
    const { user } = await requireStudentAutoProvision();
    return NextResponse.json(await getLearningJourney(user.id));
  } catch (error) {
    return handleBriefError("student/journey", error);
  }
}
