import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { getTemporalConflicts } from "@/lib/server/services/temporal-conflicts";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const viewer = await getViewerContext();
    const conflicts = await getTemporalConflicts(id, viewer);
    return NextResponse.json({ conflicts });
  } catch (error) {
    return toErrorResponse(error);
  }
}
