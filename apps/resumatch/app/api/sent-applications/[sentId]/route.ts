import { NextResponse } from "next/server";
import { getSentEmail } from "../../../../lib/applicationEmail/sentList";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * One sent application email, read-only. There is deliberately no PUT,
 * PATCH or DELETE here (Next answers 405): a sent email's content is a
 * record of what went out and cannot be edited. Account erasure removes it
 * with the rest of the workspace.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sentId: string }> }) {
  const { sentId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const sent = await getSentEmail(workspace.id, sentId);
  if (!sent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ sent });
}
