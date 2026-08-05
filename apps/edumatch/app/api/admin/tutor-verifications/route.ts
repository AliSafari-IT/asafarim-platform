import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { listAdminVerificationQueue } from "@/lib/server/tutor-verification";

export const runtime = "nodejs";

/**
 * GET /api/admin/tutor-verifications
 *
 * Admin queue: tutors that need a verification decision (and tutors that are
 * already verified, for context). Returns one entry per tutor with their
 * latest review row, if any.
 */
export async function GET(_req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const queue = await listAdminVerificationQueue({ limit: 100 });
    return NextResponse.json({ tutors: queue });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/tutor-verifications", error);
    }
    return serverError("admin/tutor-verifications", error);
  }
}
