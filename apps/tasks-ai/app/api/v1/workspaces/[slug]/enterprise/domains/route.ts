import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { claimDomain } from "../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const b = (await req.json().catch(() => ({}))) as { domain?: string };
  return ok(await claimDomain(ctx, b.domain ?? ""), { status: 201 });
});
