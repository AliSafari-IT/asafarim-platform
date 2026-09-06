import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { revokeToken } from "../../../../../../../lib/tokens/service";
export const dynamic = "force-dynamic";
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await revokeToken(ctx, params.id)));
