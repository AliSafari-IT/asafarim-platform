import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createImport } from "../../../../../../lib/import/service";

export const dynamic = "force-dynamic";

// POST { kind, filename, projectId, mapping, content } -> dry-run summary.
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await createImport(ctx, body), { status: 201 });
});
