import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { unwatch, watch } from "../../../../../../../../lib/services/watchers";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ ctx, params }) => ok(await watch(ctx, params.id)));
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await unwatch(ctx, params.id)));
