import { NextResponse } from "next/server";
import { contentDisposition } from "../../../../lib/documentPdfs/filename";
import { failureResponse } from "../../../../lib/applications/timeline/http";
import { deleteAttachment, readAttachment } from "../../../../lib/applications/timeline/service";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * One timeline attachment, to its owner only (another workspace's id is a
 * 404). Screenshots and PDFs open inline with `?download=1` to save;
 * a saved email is always a download, sent as plain bytes, never rendered:
 * the timeline shows its text instead. Every response forbids sniffing and
 * runs under a sandboxing CSP, so nothing in a file can script the app.
 */
export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const result = await readAttachment(workspace.id, attachmentId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "not_found" ? "Not found" : "This file can't be read." }, { status: result.reason === "not_found" ? 404 : 410 });
  }
  const download = result.row.kind === "EMAIL" || new URL(request.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(result.bytes), {
    headers: {
      "content-type": result.row.kind === "EMAIL" ? "application/octet-stream" : result.row.contentType,
      "content-length": String(result.bytes.byteLength),
      "content-disposition": contentDisposition(result.row.filename, download ? "attachment" : "inline"),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const result = await deleteAttachment(workspace.id, attachmentId);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json({ ok: true });
}
