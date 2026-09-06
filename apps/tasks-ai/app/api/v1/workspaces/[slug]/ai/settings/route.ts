import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { getAiSettings, updateAiSettings } from "../../../../../../../lib/ai/settings";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await getAiSettings(ctx)));
export const PATCH = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await updateAiSettings(ctx, body));
});
