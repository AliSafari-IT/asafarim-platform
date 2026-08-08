import { NextResponse, type NextRequest } from "next/server";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { createTimeline } from "@/lib/server/services/timelines";
import { listMyTimelines } from "@/lib/server/services/timelines";
import { enforceGuestRateLimit } from "@/lib/server/guest-rate-limit";
import { TimelineInputSchema } from "@/lib/schemas";

// Open to guests: ownership is derived server-side from the session (if
// any) or a hashed IP (see getViewerContext), never from the request body.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = TimelineInputSchema.parse(body);
    const viewer = await getViewerContext();

    // Rate-limit guest creation only (spec §4) — authenticated users are
    // already accountable via their Hub identity and get no extra limit
    // here. A guest with no resolvable IP hash is already rejected by
    // createTimeline itself, so there's nothing to rate-limit in that case.
    if (!viewer.userId && viewer.guestIdHash) {
      await enforceGuestRateLimit("create", viewer.guestIdHash);
    }

    const timeline = await createTimeline(input, {
      ownerUserId: viewer.userId,
      guestIdHash: viewer.guestIdHash,
    });
    return NextResponse.json({ timeline }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Authenticated dashboard listing. Guests have no listing endpoint — their
// only path back to a submission is the confirmation page/local storage.
export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewerContext();
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const page = await listMyTimelines(viewer, { cursor, limit });
    return NextResponse.json(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}
