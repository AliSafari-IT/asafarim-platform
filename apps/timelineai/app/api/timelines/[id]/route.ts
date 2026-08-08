import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import {
  getTimelineForEdit,
  updateTimelineContent,
  deleteTimeline,
} from "@/lib/server/services/timelines";
import { TimelineInputSchema } from "@/lib/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const viewer = await getViewerContext();
    const timeline = await getTimelineForEdit(id, viewer);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { version, ...rest } = body as { version?: number };
    const input = TimelineInputSchema.parse(rest);
    if (typeof version !== "number") {
      return NextResponse.json(
        { error: "validation_failed", message: "Missing the current version to save against." },
        { status: 400 }
      );
    }
    const viewer = await getViewerContext();
    const timeline = await updateTimelineContent(id, input, viewer, version);
    return NextResponse.json({ timeline });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const viewer = await getViewerContext();
    await deleteTimeline(id, viewer);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
