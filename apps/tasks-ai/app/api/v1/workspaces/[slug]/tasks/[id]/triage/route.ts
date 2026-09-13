import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { triageTask } from "../../../../../../../../lib/capture/service";

export const dynamic = "force-dynamic";

/**
 * Organize one Inbox item (issue #366): project, owner, due date, and the
 * triage stamp in a single call, so the triage list stays fast and
 * keyboard-driven instead of forcing a full task-detail workflow per field.
 */
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await triageTask(ctx, params.id, body));
});
