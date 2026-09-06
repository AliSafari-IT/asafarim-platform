import { z } from "zod";
import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { setRuleState } from "../../../../../../../../lib/automations/service";
export const dynamic = "force-dynamic";
const s = z.object({ state: z.enum(["active", "paused", "draft"]) });
export const PATCH = workspaceRoute(async ({ req, ctx, params }) => {
  const { state } = s.parse(await req.json().catch(() => ({})));
  return ok(await setRuleState(ctx, params.id, state));
});
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await setRuleState(ctx, params.id, "draft")));
