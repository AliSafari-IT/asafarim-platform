import { contentDisposition } from "../../../../lib/documentPdfs/filename";
import { readPdfBytes } from "../../../../lib/documentPdfs/service";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Stream one rendered PDF to its owner: inline for preview, or as a
 * download with `?download=1`. Bytes are checked against the hash recorded
 * when the PDF was made; a mismatch is never served.
 */
export async function GET(request: Request, { params }: { params: Promise<{ pdfId: string }> }) {
  const { pdfId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return Response.json({ error: "Not authorized" }, { status: 401 });

  const result = await readPdfBytes(workspace.id, pdfId);
  if (!result.ok) {
    return Response.json({ error: result.reason === "not_found" ? "Not found" : "This PDF can't be read." }, { status: result.reason === "not_found" ? 404 : 410 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(result.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(result.bytes.byteLength),
      "content-disposition": contentDisposition(result.pdf.filename, download ? "attachment" : "inline"),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
