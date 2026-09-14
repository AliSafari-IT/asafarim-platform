import { withIdempotency, workspaceRoute } from "../../../../../../../../lib/api/handler";
import { readVersion } from "../../../../../../../../lib/api/http";
import { planTask } from "../../../../../../../../lib/work/service";

export const dynamic = "force-dynamic";

/**
 * The scoped quick-edit behind My Work's planning actions (issue #367):
 * change the due date, or hand the work to somebody (or nobody). Same
 * assignee validation and same optimistic-concurrency contract as triage —
 * it is one editing model, not a second one. `If-Match` carries the version
 * the row was rendered from; a stale one is a 409, never a silent overwrite.
 *
 * Like every other mutating POST here it runs under `withIdempotency`: a
 * client that retries after losing the response replays the original result
 * instead of re-executing. Without that, a versioned retry would lose to its
 * own first attempt with `conflict_version`, and an unversioned one would
 * quietly apply the edit — and its activity event — twice.
 *
 * The fingerprint is `{ body, version }`, not the body alone: `If-Match` is
 * part of the mutation's precondition, so the same key with a new version is
 * a different request. Fingerprinting only the body would replay the old
 * response and quietly skip the stale-version check the client asked for.
 */
export const POST = workspaceRoute(async ({ req, ctx, params }) => {
  const body = await req.json().catch(() => ({}));
  const version = readVersion(req);
  return withIdempotency(ctx, req, { body, version }, async () => ({
    status: 200,
    data: await planTask(ctx, params.id, body, version),
  }));
});
