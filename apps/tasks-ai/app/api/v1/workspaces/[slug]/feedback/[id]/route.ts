import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { triageFeedback } from "../../../../../../../lib/beta/service";
export const dynamic = "force-dynamic";
export const PATCH = workspaceRoute(async ({ req, ctx, params }) => ok(await triageFeedback(ctx, params.id, await req.json().catch(() => ({})))));
