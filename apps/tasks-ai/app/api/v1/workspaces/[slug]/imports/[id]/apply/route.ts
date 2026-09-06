import { workspaceRoute } from "../../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../../lib/api/http";
import { applyImport } from "../../../../../../../../lib/import/service";

export const dynamic = "force-dynamic";

// Idempotent + resumable: safe to call again after success or a crash.
export const POST = workspaceRoute(async ({ ctx, params }) => ok(await applyImport(ctx, params.id)));
