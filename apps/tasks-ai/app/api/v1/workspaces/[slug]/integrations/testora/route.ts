import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { connectTestora } from "../../../../../../../lib/integrations/testora";
import { listIntegrations } from "../../../../../../../lib/integrations/github";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await listIntegrations(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) =>
  ok(await connectTestora(ctx, await req.json().catch(() => ({}))), { status: 201 }),
);
