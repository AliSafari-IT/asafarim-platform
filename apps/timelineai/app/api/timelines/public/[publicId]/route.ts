import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { getTimelineForView } from "@/lib/server/services/timelines";

type RouteContext = { params: Promise<{ publicId: string }> };

// Backs both the public share page and export rendering. Access is gated
// entirely by canAccess (visibility + moderationStatus + ownership) —
// there is no separate "is this public" shortcut here.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { publicId } = await params;
    const viewer = await getViewerContext();
    const timeline = await getTimelineForView(publicId, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
