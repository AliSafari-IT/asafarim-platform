import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { flowDashboard } from "../../../../../../../lib/analytics/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  return ok(await flowDashboard(ctx, projectId));
});
