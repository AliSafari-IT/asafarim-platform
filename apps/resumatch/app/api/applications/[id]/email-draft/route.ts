import { NextResponse } from "next/server";
import { draftSaveSchema } from "../../../../../lib/applicationEmail/normalize";
import { saveDraft } from "../../../../../lib/applicationEmail/service";
import { logError } from "../../../../../lib/observability/logger";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** Save the application email draft. Owner-checked through the
 *  application; attachments must be this application's own PDFs; `version`
 *  must match the stored draft (409 with the current one otherwise). No
 *  response or log line carries the draft's text. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = draftSaveSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")).filter(Boolean))].sort();
    return NextResponse.json({ error: "Invalid draft.", fields }, { status: 400 });
  }

  try {
    const result = await saveDraft(workspace.id, id, parsed.data);
    if (result.ok) return NextResponse.json({ draft: result.draft });
    if (result.reason === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.reason === "attachment_mismatch") {
      return NextResponse.json({ error: "Those PDFs don't belong to this application.", code: result.reason }, { status: 422 });
    }
    return NextResponse.json({ error: "The draft was changed elsewhere.", code: "conflict", current: result.current ?? null }, { status: 409 });
  } catch (error) {
    logError("application_email.draft_save_failed", error, { applicationId: id });
    return NextResponse.json({ error: "Could not save the draft." }, { status: 500 });
  }
}
