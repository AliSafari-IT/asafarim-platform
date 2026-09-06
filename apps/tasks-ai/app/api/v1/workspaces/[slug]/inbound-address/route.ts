import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { getInboundAddress, provisionInboundAddress } from "../../../../../../lib/capture/inbound";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await getInboundAddress(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = (await req.json().catch(() => ({}))) as { projectId?: string };
  return ok(await provisionInboundAddress(ctx, body.projectId), { status: 201 });
});
