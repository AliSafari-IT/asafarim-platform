import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getViewerContext } from "@/lib/server/authz";
import { toErrorResponse } from "@/lib/server/api-errors";
import { getTimelineForView } from "@/lib/server/services/timelines";
import { enforceGuestRateLimit } from "@/lib/server/guest-rate-limit";
import { renderTimelineExport, type ExportFormat } from "@/lib/server/services/export";

const ExportRequestSchema = z.object({
  publicId: z.string().min(1).max(64),
  format: z.enum(["png", "jpg", "pdf"]),
});

const CONTENT_TYPES: Record<ExportFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  pdf: "application/pdf",
};

// Server-only, never derived from client input: where THIS app can reach
// itself to render its own public page headlessly. Falls back to the
// public URL for local dev where there's no separate internal network.
const internalOrigin =
  process.env.TIMELINEAI_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_TIMELINEAI_URL ||
  "http://localhost:3010";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { publicId, format } = ExportRequestSchema.parse(body);

    const viewer = await getViewerContext();
    // Reuses the exact same access rule the public share page enforces —
    // you can only export what you're allowed to view (spec §9: export
    // authorization mirrors view authorization, no separate looser gate).
    const timeline = await getTimelineForView(publicId, viewer);

    if (!viewer.userId && viewer.guestIdHash) {
      await enforceGuestRateLimit("export", viewer.guestIdHash);
    }

    const url = `${internalOrigin}/t/${encodeURIComponent(timeline.publicId)}`;
    const buffer = await renderTimelineExport({ url, format });

    const safeFilename = timeline.title.replace(/[^a-z0-9-_ ]/gi, "").trim().slice(0, 80) || "timeline";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[format],
        "Content-Disposition": `attachment; filename="${safeFilename}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
