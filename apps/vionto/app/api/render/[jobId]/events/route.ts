import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest } from "@/lib/server/auth";

export const runtime = "nodejs";

const SSE_RETRY_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_SSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes max

function encodeSSE(data: unknown, event?: string): string {
  let out = "";
  if (event) out += `event: ${event}\n`;
  out += `data: ${JSON.stringify(data)}\n\n`;
  return out;
}

/**
 * GET /api/render/[jobId]/events
 *
 * Server-Sent Events stream for real-time render job progress.
 * Emits progress, state changes, completion, failure, and heartbeats.
 * Auto-closes after 10 minutes or when the job reaches a terminal state.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getAuthedUser();
  if (!user) return unauthorized();

  const { jobId } = await params;

  const job = await prisma.viontoRenderJob.findFirst({
    where: { id: jobId, userId: user.id },
    select: {
      id: true,
      state: true,
      progressPercent: true,
      retryCount: true,
      errorSummary: true,
      logs: true,
      startedAt: true,
      completedAt: true,
    },
  });

  if (!job) {
    return badRequest("Render job not found.");
  }

  const encoder = new TextEncoder();
  let lastState = job.state;
  let lastProgress = job.progressPercent;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      controller.enqueue(
        encoder.encode(
          encodeSSE(
            {
              jobId: job.id,
              state: job.state,
              progressPercent: job.progressPercent,
              retryCount: job.retryCount,
              errorSummary: job.errorSummary,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
              logs: job.logs?.split("\n").slice(-20) ?? [],
            },
            "state"
          )
        )
      );

      // Send retry hint
      controller.enqueue(encoder.encode(`retry: ${SSE_RETRY_MS}\n\n`));

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSSE({ now: Date.now() }, "heartbeat")));
      }, HEARTBEAT_INTERVAL_MS);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const current = await prisma.viontoRenderJob.findFirst({
            where: { id: jobId, userId: user.id },
            select: {
              state: true,
              progressPercent: true,
              retryCount: true,
              errorSummary: true,
              logs: true,
              completedAt: true,
            },
          });
          if (!current) {
            controller.enqueue(encoder.encode(encodeSSE({ reason: "job_deleted" }, "close")));
            closed = true;
            clearInterval(poll);
            clearInterval(heartbeat);
            controller.close();
            return;
          }

          if (current.state !== lastState || current.progressPercent !== lastProgress) {
            lastState = current.state;
            lastProgress = current.progressPercent;
            controller.enqueue(
              encoder.encode(
                encodeSSE(
                  {
                    jobId,
                    state: current.state,
                    progressPercent: current.progressPercent,
                    retryCount: current.retryCount,
                    errorSummary: current.errorSummary,
                    completedAt: current.completedAt,
                    logs: current.logs?.split("\n").slice(-20) ?? [],
                  },
                  current.state === "completed" || current.state === "failed" || current.state === "cancelled"
                    ? current.state
                    : "progress"
                )
              )
            );
          }

          if (current.state === "completed" || current.state === "failed" || current.state === "cancelled") {
            closed = true;
            clearInterval(poll);
            clearInterval(heartbeat);
            controller.close();
          }
        } catch {
          // Silently ignore polling errors; heartbeat keeps connection alive
        }
      }, SSE_RETRY_MS);

      // Safety timeout
      setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(poll);
          clearInterval(heartbeat);
          controller.enqueue(encoder.encode(encodeSSE({ reason: "timeout" }, "close")));
          controller.close();
        }
      }, MAX_SSE_DURATION_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
