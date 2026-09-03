import { NextResponse } from "next/server";
import { deleteDocument } from "../../../../lib/documents/service";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { documentId } = await context.params;
  // deleteDocument scopes by workspace, so an id belonging to someone else
  // is indistinguishable from one that does not exist — which is the
  // response we want either way.
  const deleted = await deleteDocument(workspace.id, documentId);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
