import { NextResponse } from "next/server";
import { auth } from "@asafarim/auth";
import { cancelRun, getRun } from "@/test-engine/executors/runLog";
import { isAdminRole } from "@/lib/access-policy";

// Cancel a run (queued or running). Several people can have runs going at
// once, so only the person who started it — or an admin — may cancel it.
export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run || run.done) {
    return NextResponse.json({ error: "Run not found or already finished" }, { status: 404 });
  }

  const session = await auth();
  const isOwner = run.owner.id !== null && run.owner.id === session?.user?.id;
  if (!isOwner && !isAdminRole(session?.user?.roles ?? [])) {
    return NextResponse.json(
      { error: "Only the person who started this run, or an admin, can cancel it." },
      { status: 403 },
    );
  }

  cancelRun(runId);
  return NextResponse.json({ cancelled: true });
}
