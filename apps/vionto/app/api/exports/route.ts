import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * GET /api/exports?projectId={projectId}
 *
 * List exports for a project.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const exports = await prisma.viontoExport.findMany({
      where: { projectId, userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        projectId: true,
        versionId: true,
        userId: true,
        storageKey: true,
        format: true,
        resolution: true,
        durationSeconds: true,
        fileSizeBytes: true,
        filename: true,
        userMode: true,
        renderMode: true,
        aspectRatio: true,
        aspectLabel: true,
        visualStyle: true,
        storyKeywords: true,
        previewTitle: true,
        previewSubtitle: true,
        createdAt: true,
        renderJobId: true,
        renderJob: {
          select: {
            state: true,
            progressPercent: true,
            errorSummary: true,
          },
        },
      },
    });

    return NextResponse.json({ data: exports });
  } catch (error) {
    return serverError("exports", error);
  }
}
