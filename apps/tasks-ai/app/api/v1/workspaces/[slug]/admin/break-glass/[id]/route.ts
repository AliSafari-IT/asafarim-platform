import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { revokeBreakGlass } from "../../../../../../../../lib/admin/service";
export const dynamic = "force-dynamic";
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await revokeBreakGlass(ctx, params.id)));
