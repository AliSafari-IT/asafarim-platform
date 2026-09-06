import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { dryRunRule } from "../../../../../../../../../lib/automations/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx, params }) => ok(await dryRunRule(ctx, params.id, await req.json().catch(() => ({})))));
