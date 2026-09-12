import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { getTemporalConflicts } from "@/lib/server/services/temporal-conflicts";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const viewer = await getViewerContext();
    const result = await getTemporalConflicts(id, viewer);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
