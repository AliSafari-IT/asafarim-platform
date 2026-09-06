import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { searchAudit } from "../../../../../../../lib/admin/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ req, ctx }) => {
  const p = Object.fromEntries(new URL(req.url).searchParams);
  return ok(await searchAudit(ctx, p));
});
