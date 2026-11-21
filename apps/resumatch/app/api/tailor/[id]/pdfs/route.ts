import { NextResponse } from "next/server";
import { describePdfStatus } from "../../../../../lib/documentPdfs/describe";
import { createPdfs } from "../../../../../lib/documentPdfs/service";
import { logError } from "../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";
// Chromium needs the Node runtime and can take a few seconds per document.
export const runtime = "nodejs";
export const maxDuration = 60;

const ERRORS = {
  not_found: [404, "This CV no longer exists."],
  no_cover_letter: [409, "This CV has no cover letter yet."],
  renderer_unavailable: [503, "PDF creation is not set up on this server yet."],
  render_failed: [502, "The PDFs could not be created. Try again in a moment."],
  storage_failed: [502, "The PDFs could not be saved. Try again in a moment."],
} as const;

/**
 * Make server-side PDFs of this CV and its cover letter, for attaching to
 * an application email. Only missing or out-of-date ones are made; an
 * existing PDF is never changed. Owner-checked inside createPdfs.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  try {
    const result = await createPdfs(workspace.id, id, request.headers.get("cookie"));
    if (!result.ok) {
      const [status, error] = ERRORS[result.reason];
      return NextResponse.json({ error, code: result.reason }, { status });
    }
    return NextResponse.json({ pdfs: describePdfStatus(result.status), created: result.created });
  } catch (error) {
    logError("documentPdf.create.failed", error, { tailoredResumeId: id });
    return NextResponse.json({ error: ERRORS.render_failed[1], code: "render_failed" }, { status: 500 });
  }
}
