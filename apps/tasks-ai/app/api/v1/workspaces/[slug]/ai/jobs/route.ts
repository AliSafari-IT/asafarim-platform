import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { runAiJob } from "../../../../../../../lib/ai/job";

export const dynamic = "force-dynamic";

// POST { kind, input, projectId? } -> { job, proposal (draft) }. Applies nothing.
export const POST = workspaceRoute(async ({ req, ctx }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await runAiJob(ctx, body), { status: 201 });
});
