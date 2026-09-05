import { NextResponse } from "next/server";
import { explainReasonCode } from "../../../../../lib/documents/pipeline";
import { extractDocument, rescanDocument } from "../../../../../lib/documents/service";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";
/** Mirrors POST /api/documents: extraction after a clean verdict is
 *  synchronous for now, and a scanned PDF can take a few seconds. */
export const maxDuration = 60;

/**
 * Retry a scan for a document quarantined because the scanner was
 * unavailable (issue #203). `rescanDocument` itself re-checks eligibility
 * against the row's actual status and reason code — this route does not
 * trust anything about the request beyond which document it names.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { documentId } = await context.params;
  const result = await rescanDocument(workspace.id, documentId);

  if (!result.ok) {
    const status = result.reasonCode === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.reasonCode }, { status });
  }

  if (result.status === "QUARANTINED") {
    // The rescan can quarantine for a different reason than the one that
    // sent it here — the scanner is back, and this time it may report a
    // real MALWARE_DETECTED verdict, which must never be explained as a
    // transient "try again later."
    return NextResponse.json({
      documentId,
      status: result.status,
      reasonCode: result.reasonCode,
      explanation: explainReasonCode(result.reasonCode),
    });
  }

  // Clean verdict: proceed straight to extraction, the same as a fresh
  // upload does — a rescan that clears a document but leaves it sitting
  // unread would just move the confusion one step later.
  let extraction = await extractDocument(workspace.id, documentId);
  while (!extraction.ok && extraction.status === "EXTRACTING") {
    extraction = await extractDocument(workspace.id, documentId);
  }

  if (!extraction.ok) {
    return NextResponse.json({
      documentId,
      status: extraction.status,
      reasonCode: extraction.reasonCode,
      explanation: explainReasonCode(extraction.reasonCode),
    });
  }

  return NextResponse.json({ documentId, status: "EXTRACTED", versionId: extraction.versionId });
}
