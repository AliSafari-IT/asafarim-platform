import { workspaceRoute } from "../../../../../../../lib/api/handler";
import { ok } from "../../../../../../../lib/api/http";
import { effectiveRetention, setRetentionPolicy } from "../../../../../../../lib/enterprise/service";
export const dynamic = "force-dynamic";
export const GET = workspaceRoute(async ({ ctx }) => ok(await effectiveRetention(ctx)));
export const PATCH = workspaceRoute(async ({ req, ctx }) => ok(await setRetentionPolicy(ctx, await req.json().catch(() => ({})))));
