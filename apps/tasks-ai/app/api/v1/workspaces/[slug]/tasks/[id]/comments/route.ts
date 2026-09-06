import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { addComment, listComments } from "../../../../../../../../lib/services/comments";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) =>
  ok(await listComments(ctx, params.id)),
);

export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await addComment(ctx, params.id, body), { status: 201 });
});
