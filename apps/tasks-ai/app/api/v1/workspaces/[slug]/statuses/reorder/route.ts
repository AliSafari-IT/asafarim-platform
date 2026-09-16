import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { reorderStatuses } from "../../../../../../../lib/services/statuses";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await reorderStatuses(ctx, body));
});
