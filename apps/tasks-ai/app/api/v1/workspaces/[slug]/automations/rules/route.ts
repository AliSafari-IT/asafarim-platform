import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { createRule, listRules } from "../../../../../../../lib/automations/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await listRules(ctx)));
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await createRule(ctx, await req.json().catch(() => ({}))), { status: 201 }));
