import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { rejectGuestSubmission } from "@/lib/server/services/moderation";

const RejectBodySchema = z.object({ reason: z.string().max(2000).nullable().optional() });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = RejectBodySchema.parse(body);
    const viewer = await getViewerContext();
    const timeline = await rejectGuestSubmission(id, reason ?? null, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}
