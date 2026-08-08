import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { approveGuestSubmission } from "@/lib/server/services/moderation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const viewer = await getViewerContext();
    const timeline = await approveGuestSubmission(id, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
