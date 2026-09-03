import { NextResponse } from "next/server";
import { MAX_DOCUMENT_BYTES } from "../../../lib/documents/fileType";
import { explainReasonCode } from "../../../lib/documents/pipeline";
import { extractDocument, listDocuments, uploadDocument } from "../../../lib/documents/service";
import { logError } from "../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";
/** Extraction is synchronous for now; a scanned PDF can take a few seconds. */
export const maxDuration = 60;

export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const documents = await listDocuments(workspace.id);
  return NextResponse.json({
    documents: documents.map((document) => ({
      ...document,
      explanation: document.reasonCode ? explainReasonCode(document.reasonCode) : null,
    })),
  });
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // The size check happens twice: once on the declared length, to reject a
  // large upload before buffering it, and once on the real byte length in
  // validateUpload, because Content-Length is caller-supplied.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_DOCUMENT_BYTES * 1.1) {
    return NextResponse.json(
      { error: explainReasonCode("FILE_TOO_LARGE"), reasonCode: "FILE_TOO_LARGE" },
      { status: 413 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch (error) {
    logError("document.upload.form_parse_failed", error);
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No file was provided." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await uploadDocument(workspace.id, bytes, file.type || null, file.name);

  if (!result.ok) {
    return NextResponse.json(
      { error: explainReasonCode(result.reasonCode), reasonCode: result.reasonCode },
      { status: 422 },
    );
  }

  // Quarantine is a successful upload with an unsuccessful outcome — 200
  // with the reason, not an error, because nothing went wrong with the
  // request itself and the UI needs to explain the state.
  if (result.status === "QUARANTINED") {
    return NextResponse.json({
      documentId: result.documentId,
      status: result.status,
      explanation: explainReasonCode("SCANNER_UNAVAILABLE"),
    });
  }

  // Retries happen here, in the request, because there is no worker yet to
  // drive them. The budget itself lives on the row, so a restart mid-retry
  // does not hand the document a fresh set of attempts. When M3 brings
  // BullMQ in for ingestion, this loop is what a queued job replaces.
  let extraction = await extractDocument(workspace.id, result.documentId);
  while (!extraction.ok && extraction.status === "EXTRACTING") {
    extraction = await extractDocument(workspace.id, result.documentId);
  }

  if (!extraction.ok) {
    return NextResponse.json({
      documentId: result.documentId,
      status: extraction.status,
      reasonCode: extraction.reasonCode,
      explanation: explainReasonCode(extraction.reasonCode),
    });
  }

  return NextResponse.json({
    documentId: result.documentId,
    status: "EXTRACTED",
    versionId: extraction.versionId,
  });
}
