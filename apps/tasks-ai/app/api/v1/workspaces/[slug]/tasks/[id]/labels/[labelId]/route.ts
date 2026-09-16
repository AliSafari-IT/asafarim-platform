import { workspaceRoute } from "../../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../../lib/api/http";
import { removeLabel } from "../../../../../../../../../lib/services/labels";

export const dynamic = "force-dynamic";

export const DELETE = workspaceRoute(async ({ ctx, params }) =>
  ok(await removeLabel(ctx, params.id, params.labelId)),
);
