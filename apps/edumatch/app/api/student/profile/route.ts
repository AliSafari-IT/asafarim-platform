import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { handleEduError } from "@/lib/server";
import {
  formatZodError,
  studentProfilePatchSchema,
  studentProfileSchema,
} from "@/lib/server/validation";
import {
  getStudentProfile,
  updateStudentProfile,
  upsertStudentProfile,
} from "@/lib/server/profiles";

export const runtime = "nodejs";

/**
 * GET /api/student/profile
 *
 * Returns the caller's EduStudentProfile, or 404 when they haven't created
 * one yet. This is how the client decides whether to show the first-run
 * intake form.
 *
 * `image` is joined in from `User` (not a column on EduStudentProfile) so
 * the profile page can show the current avatar without a second request.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const [profile, dbUser] = await Promise.all([
      getStudentProfile(user.id),
      prisma.user.findUnique({ where: { id: user.id }, select: { image: true } }),
    ]);
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ...profile, image: dbUser?.image ?? null });
  } catch (error) {
    return serverError("student/profile GET", error);
  }
}

/**
 * POST /api/student/profile
 *
 * Create (or overwrite) the caller's EduStudentProfile and attach the
 * `edumatch_student` role. Safe to call repeatedly — subsequent calls act
 * as a full-replace upsert.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = studentProfileSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const profile = await upsertStudentProfile(user.id, parsed.data);
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("student/profile POST", error);
    }
    return serverError("student/profile POST", error);
  }
}

/**
 * PATCH /api/student/profile
 *
 * Partial update of the caller's EduStudentProfile. Returns 403 when the
 * profile doesn't exist — clients must POST first.
 */
export async function PATCH(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = studentProfilePatchSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const profile = await updateStudentProfile(user.id, parsed.data);
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("student/profile PATCH", error);
    }
    return serverError("student/profile PATCH", error);
  }
}
