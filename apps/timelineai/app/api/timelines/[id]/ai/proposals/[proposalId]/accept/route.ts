import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { acceptAiProposal } from "@/lib/server/services/ai-proposals";
import { NARRATIVE_VARIANTS } from "@/lib/ai/narrative";

const AcceptInputSchema = z.object({
  /** For narrative_suggestion proposals only — which stored variant to apply. Defaults to the "standard" suggestedText. */
  variant: z.enum(NARRATIVE_VARIANTS).optional(),
  /** For visual_recommendation proposals only — which candidate index to apply. Defaults to the payload's recommendedIndex. */
  candidateIndex: z.number().int().min(0).max(2).optional(),
  /** For events_extraction proposals only — which event indexes to create. Defaults to all of them. */
  eventIndexes: z.array(z.number().int().min(0)).max(100).optional(),
});

type RouteContext = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { proposalId } = await params;
    const body = await req.json().catch(() => ({}));
    const { variant, candidateIndex, eventIndexes } = AcceptInputSchema.parse(body);
    const viewer = await getViewerContext();
    const proposal = await acceptAiProposal(proposalId, viewer, { variant, candidateIndex, eventIndexes });
    return NextResponse.json({ proposal });
  } catch (error) {
    return toErrorResponse(error);
  }
}
