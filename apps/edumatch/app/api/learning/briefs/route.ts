import { NextResponse } from "next/server";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { intakeStartSchema } from "@/lib/server/learning-brief";
import { listBriefsForStudent, startIntake } from "@/lib/server/learning-briefs";

export const runtime = "nodejs";

/**
 * POST /api/learning/briefs
 *
 * Start a conversation. This is the front door of the whole product: one
 * message (typed, transcribed, or accompanied by a photo of an exercise) and
 * nothing else. The response carries whatever the student should see next —
 * immediate help, one follow-up question, or both.
 */
export async function POST(req: Request) {
  try {
    const { user, profile } = await requireStudentAutoProvision();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = intakeStartSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const localeHint =
      parsed.data.localeHint ?? resolveLocaleFromCookie(req.headers.get("cookie"));

    const result = await startIntake(
      user.id,
      { ...parsed.data, localeHint },
      { profilePreferred: profile.preferredLanguage },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleBriefError("learning/briefs", error);
  }
}

/** GET /api/learning/briefs — the student's own briefs, newest activity first. */
export async function GET() {
  try {
    const { user } = await requireStudentAutoProvision();
    const items = await listBriefsForStudent(user.id);
    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return handleBriefError("learning/briefs", error);
  }
}
