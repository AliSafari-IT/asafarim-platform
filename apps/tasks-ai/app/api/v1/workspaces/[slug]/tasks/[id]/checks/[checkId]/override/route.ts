import { workspaceRoute } from "../../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../../lib/api/http";
import { overrideCheck } from "../../../../../../../../../../lib/services/task-checks";

export const dynamic = "force-dynamic";

// owner/admin override — the gate assists, it doesn't trap (issue #265).
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await overrideCheck(ctx, params.id, params.checkId, body));
});
