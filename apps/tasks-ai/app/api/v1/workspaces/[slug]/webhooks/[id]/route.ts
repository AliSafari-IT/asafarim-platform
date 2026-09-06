import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { deleteEndpoint } from "../../../../../../../lib/webhooks/service";
export const dynamic = "force-dynamic";
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await deleteEndpoint(ctx, params.id)));
