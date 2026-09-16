import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { archiveLabel } from "../../../../../../../lib/services/labels";

export const dynamic = "force-dynamic";

export const DELETE = workspaceRoute(async ({ ctx, params }) => ok(await archiveLabel(ctx, params.id)));
