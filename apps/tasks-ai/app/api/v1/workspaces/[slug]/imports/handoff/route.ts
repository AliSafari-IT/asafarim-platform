import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { createHandoffImport } from "../../../../../../../lib/import/service";

export const dynamic = "force-dynamic";

// POST { projectId, content, captureToInbox } -> dry-run summary of an AI Workbench handoff (#678).
export const POST = workspaceRoute(async ({ req, ctx }) => {
  // JSON only: a cross-site form can't post here (and JSON needs a CORS preflight this route never answers).
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: { code: "unsupported_media_type", message: "Send the handoff as JSON." } }, { status: 415 });
  }
  const body = await req.json().catch(() => ({}));
  return ok(await createHandoffImport(ctx, body), { status: 201 });
});
