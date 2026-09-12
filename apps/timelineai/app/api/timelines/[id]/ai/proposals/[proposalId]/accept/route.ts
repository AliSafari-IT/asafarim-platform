import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { acceptAiProposal } from "@/lib/server/services/ai-proposals";

const AcceptInputSchema = z.object({
  /** For visual_recommendation proposals only — which candidate index to apply. Defaults to the payload's recommendedIndex. */
  candidateIndex: z.number().int().min(0).max(2).optional(),
});

type RouteContext = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { proposalId } = await params;
    const body = await req.json().catch(() => ({}));
    const { candidateIndex } = AcceptInputSchema.parse(body);
    const viewer = await getViewerContext();
    const proposal = await acceptAiProposal(proposalId, viewer, { candidateIndex });
    return NextResponse.json({ proposal });
  } catch (error) {
    return toErrorResponse(error);
  }
}
