import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";
import { matchAndInvite, previewMatches } from "@/lib/server/brief-flow";

export const runtime = "nodejs";

/**
 * GET /api/learning/briefs/[id]/matches
 *
 * Preview the up-to-five tutors this brief would be shown to. Read-only from
 * the tutors' point of view: nobody is notified.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;
    const preview = await previewMatches(id, user.id);
    return NextResponse.json(preview);
  } catch (error) {
    return handleBriefError("learning/briefs/[id]/matches", error);
  }
}

/**
 * POST /api/learning/briefs/[id]/matches
 *
 * Share the confirmed brief with those tutors and invite them to prepare a
 * proposal. Idempotent while an invite is still open — pressing it twice does
 * not fan the same brief out to a second set of tutors.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;
    const summary = await matchAndInvite(id, user.id);
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    return handleBriefError("learning/briefs/[id]/matches", error);
  }
}
