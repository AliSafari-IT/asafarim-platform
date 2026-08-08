import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { adminDeleteTimeline } from "@/lib/server/services/moderation";

const DeleteBodySchema = z.object({ reason: z.string().max(2000).nullable().optional() });

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = DeleteBodySchema.parse(body);
    const viewer = await getViewerContext();
    await adminDeleteTimeline(id, viewer, reason ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
