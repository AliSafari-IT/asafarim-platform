import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { listRuns } from "../../../../../../../../../lib/automations/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx, params }) => ok(await listRuns(ctx, params.id)));
