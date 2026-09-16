import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { archiveStatus } from "../../../../../../../lib/services/statuses";

export const dynamic = "force-dynamic";

export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await archiveStatus(ctx, params.id)));
