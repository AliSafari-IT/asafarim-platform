import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { scimLog, scimPush } from "../../../../../../../lib/enterprise/scim";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await scimLog(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await scimPush(ctx, await req.json().catch(() => ({}))), { status: 201 }));
