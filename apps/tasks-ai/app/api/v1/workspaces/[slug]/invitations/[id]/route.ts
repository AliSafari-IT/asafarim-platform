import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { revokeInvitation } from "../../../../../../../lib/services/invitations";

export const dynamic = "force-dynamic";

export const DELETE = workspaceRoute(async ({ ctx, params }) =>
  ok(await revokeInvitation(ctx, params.id)),
);
