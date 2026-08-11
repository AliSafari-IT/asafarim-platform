import { NextResponse } from "next/server";
import { getAuthedUser, badRequest, serverError, unauthorized } from "@/lib/server/auth";
import { handleEduError } from "@/lib/server";
import { formatZodError, avatarSelectSchema } from "@/lib/server/validation";
import { AvatarError, getAvatarState, setStudentAvatar } from "@/lib/server/avatars";

export const runtime = "nodejs";

/**
 * GET /api/student/avatar
 *
 * The avatar picker's data source: current image, whether the student can
 * prove they're 13+ (`ageVerified`/`canUpload`), and the full drawn-avatar
 * list with ready-to-use `src` paths — so the client never hard-codes
 * `/avatars/students/{id}.svg` itself.
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const state = await getAvatarState(user.id);
    return NextResponse.json(state);
  } catch (error) {
    return serverError("student/avatar GET", error);
  }
}

/**
 * PATCH /api/student/avatar
 *
 * Set the caller's avatar to either a preset (any student, any age) or an
 * uploaded photo (13+ only — re-enforced here regardless of what the client
 * sends; see setStudentAvatar()).
 */
export async function PATCH(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = avatarSelectSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const result = await setStudentAvatar(user.id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AvatarError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("student/avatar PATCH", error);
    }
    return serverError("student/avatar PATCH", error);
  }
}
