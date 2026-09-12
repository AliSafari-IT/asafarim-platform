import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { setEventNarrativeLock } from "@/lib/server/services/ai-locks";

const LockInputSchema = z.object({
  locked: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string; eventId: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const { id, eventId } = await params;
    const body = await req.json();
    const { locked } = LockInputSchema.parse(body);
    const viewer = await getViewerContext();
    const event = await setEventNarrativeLock(id, eventId, locked, viewer);
    return NextResponse.json({ event });
  } catch (error) {
    return toErrorResponse(error);
  }
}
