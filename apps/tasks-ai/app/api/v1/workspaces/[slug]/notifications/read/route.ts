import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { markRead } from "../../../../../../../lib/services/notifications";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  return ok({ marked: await markRead(ctx, body.ids ?? []) });
});
