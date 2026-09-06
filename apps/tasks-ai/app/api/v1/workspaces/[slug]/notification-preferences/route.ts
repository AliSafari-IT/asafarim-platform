import { z } from "zod";
import { workspaceRoute } from "../../../../../../lib/api/handler";
import { ok } from "../../../../../../lib/api/http";
import { getPreferences, updatePreferences } from "../../../../../../lib/services/notifications";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    emailDigest: z.boolean(),
    digestCadence: z.enum(["off", "hourly", "daily"]),
    mentionEmail: z.boolean(),
    assignmentEmail: z.boolean(),
    quietHours: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).nullable(),
  })
  .partial();

export const GET = workspaceRoute(async ({ ctx }) => ok(await getPreferences(ctx)));

export const PATCH = workspaceRoute(async ({ req, ctx }) => {
  const body = patchSchema.parse(await req.json().catch(() => ({})));
  return ok(await updatePreferences(ctx, body));
});
