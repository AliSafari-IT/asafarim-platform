import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { recordBetaDecision } from "../../../../../../../lib/beta/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ req, ctx }) => ok(await recordBetaDecision(ctx, await req.json().catch(() => ({})))));
