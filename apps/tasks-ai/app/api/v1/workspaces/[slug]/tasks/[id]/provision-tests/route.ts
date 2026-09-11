import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { provisionTestsForTask } from "../../../../../../../../lib/services/provisioning";

export const dynamic = "force-dynamic";

// "Provision tests in Testora" — human-triggered, opt-in per workspace via
// the testora integration (issue #266). Re-running re-syncs (idempotent).
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await provisionTestsForTask(ctx, params.id, body), { status: 201 });
});
