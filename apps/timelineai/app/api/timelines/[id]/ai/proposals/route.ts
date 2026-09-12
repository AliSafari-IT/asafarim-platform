import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { generateAiProposal } from "@/lib/server/services/ai-proposals";
import { AI_PROPOSAL_KINDS } from "@/lib/ai/schemas";

const GenerateInputSchema = z
  .object({
    kind: z.enum(AI_PROPOSAL_KINDS),
    sourceContent: z.string().min(1).max(20_000),
    /** Required for kind "temporal_correction" — the event whose date is being reinterpreted. Ignored for every other kind. */
    targetEventId: z.string().min(1).max(64).optional(),
  })
  .refine((input) => input.kind !== "temporal_correction" || !!input.targetEventId, {
    message: "targetEventId is required for temporal_correction.",
    path: ["targetEventId"],
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { kind, sourceContent, targetEventId } = GenerateInputSchema.parse(body);
    const viewer = await getViewerContext();
    const proposal = await generateAiProposal(id, viewer, kind, sourceContent, { targetEventId });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
