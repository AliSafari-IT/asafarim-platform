import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { setLayout } from "@/lib/server/services/timelines";
import { TIMELINE_LAYOUTS } from "@/lib/schemas";

const LayoutInputSchema = z.object({ layout: z.enum(TIMELINE_LAYOUTS) });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { layout } = LayoutInputSchema.parse(body);
    const viewer = await getViewerContext();
    const timeline = await setLayout(id, layout, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
