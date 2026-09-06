import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { disableServiceAccount } from "../../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await disableServiceAccount(ctx, params.id)));
