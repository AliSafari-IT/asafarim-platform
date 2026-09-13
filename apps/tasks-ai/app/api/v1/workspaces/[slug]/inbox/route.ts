import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { listInbox } from "../../../../../../lib/capture/service";

export const dynamic = "force-dynamic";

/**
 * The triage inbox (issue #366): captured work that still needs organizing,
 * with the project/provenance context the triage list needs, in one call.
 */
export const GET = workspaceRoute(async ({ ctx }) => ok(await listInbox(ctx)));
