import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { duplicateTimeline } from "@/lib/server/services/timelines";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const viewer = await getViewerContext();
    const timeline = await duplicateTimeline(id, viewer);
    return NextResponse.json({ timeline }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
