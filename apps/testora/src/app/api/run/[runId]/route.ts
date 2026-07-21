import { NextResponse } from "next/server";
import { cancelRun } from "@/test-engine/executors/runLog";

export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const cancelled = cancelRun(runId);
  if (!cancelled) {
    return NextResponse.json({ error: "Run not found or already finished" }, { status: 404 });
  }
  return NextResponse.json({ cancelled: true });
}
