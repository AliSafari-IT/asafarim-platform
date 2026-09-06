import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { rotateToken } from "../../../../../../../../lib/tokens/service";
export const dynamic = "force-dynamic";
export const POST = workspaceRoute(async ({ ctx, params }) => ok(await rotateToken(ctx, params.id)));
