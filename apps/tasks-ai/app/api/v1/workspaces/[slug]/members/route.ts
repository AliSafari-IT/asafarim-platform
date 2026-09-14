import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { listAssignableMembers } from "../../../../../../lib/capture/service";

export const dynamic = "force-dynamic";

/** Members who can own work — the "assign to a teammate" list in triage. */
export const GET = workspaceRoute(async ({ ctx }) => ok(await listAssignableMembers(ctx)));
