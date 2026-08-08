import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { setVisibility } from "@/lib/server/services/timelines";
import { TimelineVisibilityInputSchema } from "@/lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { visibility } = TimelineVisibilityInputSchema.parse(body);
    const viewer = await getViewerContext();
    const timeline = await setVisibility(id, visibility, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
