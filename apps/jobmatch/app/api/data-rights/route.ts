import { NextResponse } from "next/server";
import { eraseWorkspaceData, exportWorkspaceData } from "../../../lib/profile/dataRights";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/** GDPR access: everything JobMatch holds for this candidate, as JSON. */
export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const data = await exportWorkspaceData(workspace.id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="jobmatch-export.json"',
      "cache-control": "private, no-store",
    },
  });
}

/**
 * GDPR erasure. Removes documents, stored bytes, and every profile version.
 *
 * The workspace row and its audit events survive: they hold action names
 * and timestamps but no CV content, and they are the only record that the
 * erasure happened. Deleting them would make the deletion unprovable.
 */
export async function DELETE() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const result = await eraseWorkspaceData(workspace.id);
  return NextResponse.json(result, { status: result.objectsFailed > 0 ? 207 : 200 });
}
