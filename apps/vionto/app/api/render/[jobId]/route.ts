import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { advanceAlbumLifecycleStage } from "@/lib/server/album-lifecycle";

export const runtime = "nodejs";

/** GET /api/render/[jobId] — read render job status and logs. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { jobId } = await params;

    const job = await prisma.viontoRenderJob.findFirst({
      where: { id: jobId, userId: user.id },
      include: {
        exports: {
          select: { id: true, storageKey: true, format: true, resolution: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!job) {
      return badRequest("Render job not found.");
    }

    if (job.state === "completed") {
      const version = job.versionId
        ? await prisma.viontoVideoVersion.findFirst({
            where: { id: job.versionId, projectId: job.projectId },
            select: { albumId: true },
          })
        : null;
      await advanceAlbumLifecycleStage(prisma, {
        projectId: job.projectId,
        albumId: version?.albumId ?? null,
        stage: job.exports.length > 0 ? "published_exported" : "video_rendered",
      });
    }

    return NextResponse.json({
      jobId: job.id,
      state: job.state,
      progressPercent: job.progressPercent,
      retryCount: job.retryCount,
      errorSummary: job.errorSummary,
      logs: job.logs,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      exports: job.exports,
    });
  } catch (error) {
    return serverError("render/[jobId]", error);
  }
}

/** DELETE /api/render/[jobId] — cancel a queued or running render job. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { jobId } = await params;

    const job = await prisma.viontoRenderJob.findFirst({
      where: { id: jobId, userId: user.id },
    });
    if (!job) {
      return badRequest("Render job not found.");
    }

    if (job.state === "completed" || job.state === "failed") {
      return badRequest("Cannot cancel a finished job.");
    }

    await prisma.viontoRenderJob.update({
      where: { id: jobId },
      data: { state: "cancelled" },
    });

    return NextResponse.json({ jobId, state: "cancelled" });
  } catch (error) {
    return serverError("render/[jobId]", error);
  }
}
