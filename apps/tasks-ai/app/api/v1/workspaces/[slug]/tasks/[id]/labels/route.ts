import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { assignLabel } from "../../../../../../../../lib/services/labels";
import { listTaskLabels } from "../../../../../../../../lib/repositories/labels";

export const dynamic = "force-dynamic";

export const GET = workspaceRoute(async ({ ctx, params }) => ok(await listTaskLabels(ctx, params.id)));

export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = (await req.json().catch(() => ({}))) as { labelId?: string };
  if (!body.labelId) {
    const { ApiError } = await import("../../../../../../../../lib/errors");
    throw new ApiError("validation_failed", { labelId: "required" });
  }
  return ok(await assignLabel(ctx, params.id, body.labelId), { status: 201 });
});
