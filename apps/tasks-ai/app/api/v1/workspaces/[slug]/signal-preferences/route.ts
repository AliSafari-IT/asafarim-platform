import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { getSignalPreferences, setSignalPreference } from "../../../../../../lib/intel/service";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx }) => ok(await getSignalPreferences(ctx)));
export const PATCH = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await setSignalPreference(ctx, body));
});
