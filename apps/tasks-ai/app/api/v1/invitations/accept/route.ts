import { route } from "../../../../../lib/api/handler";
import { ok } from "../../../../../lib/api/http";
import { ApiError } from "../../../../../lib/errors";
import { acceptInvitation } from "../../../../../lib/services/invitations";

export const dynamic = "force-dynamic";

export const POST = route(async (req, cid) => {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) throw new ApiError("validation_failed", { token: "required" });
  return ok(await acceptInvitation(body.token, cid));
});
