import { NextResponse } from "next/server";
import { z } from "zod";
import { trackedJobStatusSchema } from "../../../lib/tracking/state";
import { deleteTrackedJob, listTrackedJobs, setTrackedJobStatus } from "../../../lib/tracking/service";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Saved-job and application tracking (JM-049, JM-050).
 *
 * Scoped to the caller's own workspace throughout, never to an id the
 * client supplies for the workspace itself — the same authorization
 * pattern every other JobMatch route uses (see lib/workspace.ts).
 */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const items = await listTrackedJobs(workspace.id);
  return NextResponse.json({ items });
}

const setStatusSchema = z.object({
  jobPostingId: z.string().trim().min(1).max(64),
  status: trackedJobStatusSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  interviewAt: z.coerce.date().nullable().optional(),
  followUpAt: z.coerce.date().nullable().optional(),
});

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = setStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That tracking update could not be understood." }, { status: 400 });
  }

  const result = await setTrackedJobStatus({ workspaceId: workspace.id, ...parsed.data });
  if (!result.ok) {
    const status = result.reasonCode === "POSTING_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.reasonCode }, { status });
  }
  return NextResponse.json({ record: result.record });
}

const deleteSchema = z.object({ jobPostingId: z.string().trim().min(1).max(64) });

export async function DELETE(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A jobPostingId is required." }, { status: 400 });
  }

  const deleted = await deleteTrackedJob(workspace.id, parsed.data.jobPostingId);
  return NextResponse.json({ deleted });
}
