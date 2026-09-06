import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { recordSignalFeedback } from "../../../../../../../lib/intel/service";

export const dynamic = "force-dynamic";

export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await recordSignalFeedback(ctx, body), { status: 201 });
});
