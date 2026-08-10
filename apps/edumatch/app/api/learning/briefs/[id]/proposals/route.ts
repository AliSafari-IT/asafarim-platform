import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";
import { compareProposals, describeDifferences } from "@/lib/server/brief-flow";

export const runtime = "nodejs";

/**
 * GET /api/learning/briefs/[id]/proposals
 *
 * The comparison view: every proposal a tutor actually sent, described with
 * the same fields, plus factual notes on how they differ. Never a ranking or
 * a recommendation — see describeDifferences().
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;

    const proposals = await compareProposals(id, user.id);
    return NextResponse.json({
      items: proposals,
      total: proposals.length,
      differences: describeDifferences(proposals),
    });
  } catch (error) {
    return handleBriefError("learning/briefs/[id]/proposals", error);
  }
}
