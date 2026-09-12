import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { setNarrativeLockedFields } from "@/lib/server/services/ai-locks";

const LockInputSchema = z.object({
  fields: z.array(z.enum(["title", "subtitle", "description"])).max(3),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Replaces the set of timeline-level fields the narrative copilot must never rewrite. */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { fields } = LockInputSchema.parse(body);
    const viewer = await getViewerContext();
    const timeline = await setNarrativeLockedFields(id, fields, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
