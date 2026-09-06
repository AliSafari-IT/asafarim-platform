import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { verifyDomain } from "../../../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const b = (await req.json().catch(() => ({}))) as { autoJoin?: boolean };
  return ok(await verifyDomain(ctx, params.id, Boolean(b.autoJoin)));
});
