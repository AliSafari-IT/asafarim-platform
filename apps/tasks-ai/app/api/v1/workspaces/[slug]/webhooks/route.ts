import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createEndpoint, listEndpoints } from "../../../../../../lib/webhooks/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await listEndpoints(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await createEndpoint(ctx, await req.json().catch(() => ({}))), { status: 201 }));
