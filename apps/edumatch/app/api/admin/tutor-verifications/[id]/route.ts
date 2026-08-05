import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import {
  setTutorVerificationStatus,
  getCurrentVerification,
  getVerificationHistory,
  type TutorVerificationStatus,
  type VerificationChecklist,
} from "@/lib/server/tutor-verification";

export const runtime = "nodejs";

const ALLOWED_STATUSES: TutorVerificationStatus[] = [
  "PENDING",
  "NEEDS_CHANGES",
  "VERIFIED",
  "REJECTED",
];

/**
 * GET /api/admin/tutor-verifications/:id
 *
 * `:id` is the *tutorId* (User.id). Returns the latest review and the
 * full review history for that tutor.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("ADMIN");
    const { id: tutorId } = await params;
    const [current, history] = await Promise.all([
      getCurrentVerification(tutorId),
      getVerificationHistory(tutorId),
    ]);
    return NextResponse.json({ tutorId, current, history });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/tutor-verifications/[id]", error);
    }
    return serverError("admin/tutor-verifications/[id]", error);
  }
}

/**
 * POST /api/admin/tutor-verifications/:id
 *
 * Set the tutor's verification status. Body:
 *   {
 *     status: "PENDING" | "NEEDS_CHANGES" | "VERIFIED" | "REJECTED",
 *     checklist?: { identityVerified, credentialsVerified, ... },
 *     adminNotes?: string,
 *     tutorMessage?: string,
 *   }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRole("ADMIN");
    const { id: tutorId } = await params;
    const body = (await req.json().catch(() => null)) as
      | {
          status?: string;
          checklist?: VerificationChecklist;
          adminNotes?: string;
          tutorMessage?: string;
        }
      | null;
    if (!body || !body.status) {
      return badRequest("status is required");
    }
    if (!ALLOWED_STATUSES.includes(body.status as TutorVerificationStatus)) {
      return badRequest(
        `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
      );
    }
    const row = await setTutorVerificationStatus({
      tutorId,
      reviewerId: user.id,
      status: body.status as TutorVerificationStatus,
      checklist: body.checklist,
      adminNotes: body.adminNotes,
      tutorMessage: body.tutorMessage,
    });
    return NextResponse.json({ ok: true, verificationId: row.id });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/tutor-verifications/[id]", error);
    }
    return serverError("admin/tutor-verifications/[id]", error);
  }
}
