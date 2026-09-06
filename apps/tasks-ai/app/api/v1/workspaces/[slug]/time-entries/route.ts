import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { logTime } from "../../../../../../lib/analytics/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await logTime(ctx, await req.json().catch(() => ({}))), { status: 201 }));
