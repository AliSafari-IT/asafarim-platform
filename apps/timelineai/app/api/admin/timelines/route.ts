import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { listTimelinesForAdmin, type AdminListFilters } from "@/lib/server/services/moderation";

export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewerContext();
    const { searchParams } = new URL(req.url);
    const filters: AdminListFilters = {
      ownership: (searchParams.get("ownership") as AdminListFilters["ownership"]) ?? undefined,
      moderationStatus: (searchParams.get("moderationStatus") as AdminListFilters["moderationStatus"]) ?? undefined,
      visibility: (searchParams.get("visibility") as AdminListFilters["visibility"]) ?? undefined,
      search: searchParams.get("search") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    };
    const page = await listTimelinesForAdmin(viewer, filters);
    return NextResponse.json(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}
