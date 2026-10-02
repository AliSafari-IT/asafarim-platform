import { NextResponse } from "next/server";
import { z } from "zod";
import { jobForLease, runnerAuthError } from "@/lib/runner-routes";
import { appendLog, runStore } from "@/test-engine/executors/runLog";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  events: z
    .array(z.object({ kind: z.literal("log"), line: z.string().max(10_000) }))
    .max(500),
});

/**
 * POST /internal/runner/jobs/:id/events — batched log lines from the runner
 * (#717). Doubles as the heartbeat: renews the job's lease and answers
 * `{ cancel }` so the runner stops a run someone cancelled.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody = await request.text();
  const denied = runnerAuthError(request, rawBody, id);
  if (denied) return denied;
  const job = await jobForLease(request, id);
  if (job instanceof NextResponse) return job;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(rawBody || "{}"));
  } catch {
    return NextResponse.json({ error: "bad_events" }, { status: 400 });
  }
  for (const event of body.events) appendLog(id, event.line);
  const lease = await runStore().renewRunnerLease(id);
  return NextResponse.json({ cancel: lease?.cancel ?? true });
}
