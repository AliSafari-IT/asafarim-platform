import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { getRenderQueue } from "@/lib/server/queue";

export const runtime = "nodejs";

/**
 * POST /api/render/[jobId]/retry
 *
 * Idempotent retry for a failed or cancelled render job.
 * Creates a new render job row, copies the manifest from the old job, and queues it.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { jobId } = await params;

    const existing = await prisma.viontoRenderJob.findFirst({
      where: { id: jobId, userId: user.id },
      include: {
        project: { select: { id: true, locale: true, mode: true, aspectRatio: true } },
      },
    });

    if (!existing) {
      return badRequest("Render job not found.");
    }

    // Only retry failed or cancelled jobs
    if (existing.state !== "failed" && existing.state !== "cancelled") {
      return NextResponse.json(
        { error: `Cannot retry a job in '${existing.state}' state.` },
        { status: 409 }
      );
    }

    // Build a minimal manifest from the old job context
    const manifest = {
      projectId: existing.project.id,
      userId: user.id,
      assets: [], // caller should provide manifest in a future iteration
    };

    const newJob = await prisma.viontoRenderJob.create({
      data: {
        projectId: existing.project.id,
        userId: user.id,
        state: "queued",
        progressPercent: 0,
        retryCount: (existing.retryCount ?? 0) + 1,
      },
    });

    await getRenderQueue().add("vionto-render", {
      jobId: newJob.id,
      manifest,
      previousJobId: jobId,
    });

    return NextResponse.json({
      jobId: newJob.id,
      previousJobId: jobId,
      state: newJob.state,
      retryCount: newJob.retryCount,
    });
  } catch (error) {
    return serverError("render/[jobId]/retry", error);
  }
}
