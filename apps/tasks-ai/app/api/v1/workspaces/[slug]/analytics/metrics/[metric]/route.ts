import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { metricHistory } from "../../../../../../../../lib/analytics/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx, params }) => ok(await metricHistory(ctx, params.metric)));
