import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { acceptAiProposal } from "@/lib/server/services/ai-proposals";

type RouteContext = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const { proposalId } = await params;
    const viewer = await getViewerContext();
    const proposal = await acceptAiProposal(proposalId, viewer);
    return NextResponse.json({ proposal });
  } catch (error) {
    return toErrorResponse(error);
  }
}
