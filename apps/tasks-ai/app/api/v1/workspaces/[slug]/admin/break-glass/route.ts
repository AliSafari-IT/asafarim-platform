import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { activeBreakGlass, grantBreakGlass } from "../../../../../../../lib/admin/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await activeBreakGlass(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await grantBreakGlass(ctx, await req.json().catch(() => ({}))), { status: 201 }));
