import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { intakeReplySchema } from "@/lib/server/learning-brief";
import { replyToIntake } from "@/lib/server/learning-briefs";

export const runtime = "nodejs";

/**
 * POST /api/learning/briefs/[id]/messages
 *
 * The student answers the one question we asked (or adds anything else). Each
 * call re-reads the whole conversation, so a student who answers three things
 * at once doesn't get asked about them one at a time anyway.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = intakeReplySchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const result = await replyToIntake(id, user.id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleBriefError("learning/briefs/[id]/messages", error);
  }
}
