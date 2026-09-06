import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { deleteComment, editComment } from "../../../../../../../lib/services/comments";

export const dynamic = "force-dynamic";

export const PATCH = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await editComment(ctx, params.id, body));
});

export const DELETE = workspaceRoute(async ({ ctx, params }) =>
  ok(await deleteComment(ctx, params.id)),
);
