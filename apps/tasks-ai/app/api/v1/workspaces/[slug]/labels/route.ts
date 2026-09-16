import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { createLabel, listLabels } from "../../../../../../lib/services/labels";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await listLabels(ctx)));

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await createLabel(ctx, body), { status: 201 });
});
