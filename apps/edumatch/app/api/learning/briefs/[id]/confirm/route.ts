import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";
import { confirmBrief } from "@/lib/server/learning-briefs";
import { previewMatches } from "@/lib/server/brief-flow";

export const runtime = "nodejs";

/**
 * POST /api/learning/briefs/[id]/confirm
 *
 * The student approves their brief. Confirming does NOT contact any tutor —
 * it only makes the brief shareable and returns a preview of who would be
 * invited, so the decision to share stays a separate, deliberate step.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;

    const brief = await confirmBrief(id, user.id);
    const preview = await previewMatches(id, user.id);

    return NextResponse.json({
      brief,
      candidates: preview.candidates,
      consideredCount: preview.consideredCount,
    });
  } catch (error) {
    return handleBriefError("learning/briefs/[id]/confirm", error);
  }
}
