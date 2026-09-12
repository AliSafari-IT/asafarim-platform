import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { acceptAiProposal } from "@/lib/server/services/ai-proposals";
import { NARRATIVE_VARIANTS } from "@/lib/ai/narrative";

const AcceptInputSchema = z.object({
  /** For narrative_suggestion proposals only — which stored variant to apply. Defaults to the "standard" suggestedText. */
  variant: z.enum(NARRATIVE_VARIANTS).optional(),
});

type RouteContext = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { proposalId } = await params;
    const body = await req.json().catch(() => ({}));
    const { variant } = AcceptInputSchema.parse(body);
    const viewer = await getViewerContext();
    const proposal = await acceptAiProposal(proposalId, viewer, { variant });
    return NextResponse.json({ proposal });
  } catch (error) {
    return toErrorResponse(error);
  }
}
