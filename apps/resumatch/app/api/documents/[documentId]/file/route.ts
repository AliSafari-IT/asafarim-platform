import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { readDocumentBytes } from "../../../../../lib/documents/storage";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Stream a candidate's own document back to them.
 *
 * Deliberately not a presigned URL. A presigned link to a CV is a bearer
 * token that outlives the session and leaks through browser history,
 * referrer headers, and anywhere the user pastes it. Streaming through an
 * authenticated route costs bandwidth and removes that whole class of leak.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { documentId } = await context.params;
  const document = await getJobmatchDb().candidateDocument.findFirst({
    where: { id: documentId, workspaceId: workspace.id, deletedAt: null },
    select: { storageKey: true, contentType: true, originalFilename: true, status: true },
  });
  if (!document) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A quarantined document is never served, not even back to its owner:
  // handing someone their own malware over an authenticated route is still
  // handing someone malware.
  if (document.status === "QUARANTINED") {
    return NextResponse.json({ error: "This document is quarantined." }, { status: 403 });
  }

  const stored = await readDocumentBytes(document.storageKey);
  if (!stored) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordAuditEvent(workspace.id, "document.downloaded", { jobId: documentId });

  return new NextResponse(Buffer.from(stored.bytes), {
    headers: {
      "content-type": document.contentType,
      // `attachment` so a PDF is never rendered in the origin's context,
      // and the filename is quoted and already stripped of control
      // characters and path separators by safeDisplayFilename.
      "content-disposition": `attachment; filename="${document.originalFilename.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
