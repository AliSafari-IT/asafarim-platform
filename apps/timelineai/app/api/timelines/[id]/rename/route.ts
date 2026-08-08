import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { renameTimeline } from "@/lib/server/services/timelines";

const RenameInputSchema = z.object({
  title: z.string().trim().min(1, "Give your timeline a title.").max(200, "Titles must be under 200 characters."),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title } = RenameInputSchema.parse(body);
    const viewer = await getViewerContext();
    const timeline = await renameTimeline(id, title, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
