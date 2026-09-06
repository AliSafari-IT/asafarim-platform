import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { liftLegalHold } from "../../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await liftLegalHold(ctx, params.id)));
