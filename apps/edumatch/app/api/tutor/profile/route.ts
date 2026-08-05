import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { handleEduError } from "@/lib/server";
import {
  formatZodError,
  tutorProfilePatchSchema,
  tutorProfileSchema,
} from "@/lib/server/validation";
import {
  getTutorProfile,
  updateTutorProfile,
  upsertTutorProfile,
} from "@/lib/server/profiles";

export const runtime = "nodejs";

/**
 * GET /api/tutor/profile
 *
 * Returns the caller's EduTutorProfile, or 404 when they haven't created
 * one yet. `verifiedAt` is read-only from this route — verification is an
 * admin-only flow handled elsewhere.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const profile = await getTutorProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    return serverError("tutor/profile GET", error);
  }
}

/**
 * POST /api/tutor/profile
 *
 * Create (or overwrite) the caller's EduTutorProfile and attach the
 * `edumatch_tutor` role. Stripe Connect onboarding and verification are
 * separate concerns and are not triggered here.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = tutorProfileSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const profile = await upsertTutorProfile(user.id, parsed.data);
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutor/profile POST", error);
    }
    return serverError("tutor/profile POST", error);
  }
}

/**
 * PATCH /api/tutor/profile
 *
 * Partial update of the caller's EduTutorProfile. Returns 403 when the
 * profile doesn't exist — clients must POST first.
 */
export async function PATCH(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = tutorProfilePatchSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const profile = await updateTutorProfile(user.id, parsed.data);
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("tutor/profile PATCH", error);
    }
    return serverError("tutor/profile PATCH", error);
  }
}
