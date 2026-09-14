import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok, readVersion } from "../../../../../../../../lib/api/http";
import { triageTask } from "../../../../../../../../lib/capture/service";

export const dynamic = "force-dynamic";

/**
 * Organize one Inbox item (issue #366): project, owner, due date, and the
 * triage stamp in a single call, so the triage list stays fast and
 * keyboard-driven instead of forcing a full task-detail workflow per field.
 *
 * `If-Match` is honoured: the version travels into the update's WHERE clause
 * so two concurrent stale triages cannot both win.
 */
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  return ok(await triageTask(ctx, params.id, body, readVersion(req)));
});
