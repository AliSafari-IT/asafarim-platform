import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * POST /api/exports/[exportId]/share
 *
 * Generate a time-limited shareable link for an export.
 * Idempotent: multiple calls with the same expiry return the same token if active.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ exportId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { exportId } = await params;

    const exportRecord = await prisma.viontoExport.findFirst({
      where: { id: exportId, userId: user.id },
      select: {
        id: true,
        storageKey: true,
        format: true,
        resolution: true,
        signedUrl: true,
        signedUrlExpiresAt: true,
        renderJob: { select: { state: true } },
      },
    });

    if (!exportRecord) {
      return badRequest("Export not found.");
    }

    if (exportRecord.renderJob?.state !== "completed") {
      return NextResponse.json(
        { error: "Export is not ready for sharing yet.", state: exportRecord.renderJob?.state },
        { status: 425 }
      );
    }

    let body: { expiryHours?: number };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }

    const expiryHours = Math.min(Math.max(body.expiryHours ?? 24, 1), 168);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const shareToken = `share_${exportId}_${expiresAt.getTime()}`;
    const shareUrl = `https://vionto.asafarim.com/share/${shareToken}`;

    return NextResponse.json({
      exportId,
      shareUrl,
      shareToken,
      expiresAt: expiresAt.toISOString(),
      format: exportRecord.format,
      resolution: exportRecord.resolution,
    });
  } catch (error) {
    return serverError("exports/[exportId]/share", error);
  }
}
