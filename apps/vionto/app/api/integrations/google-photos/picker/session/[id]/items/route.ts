import { NextResponse } from "next/server";

import { getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { listPickedItems } from "@/lib/server/google-photos/picker";
import { authErrorResponse } from "@/lib/server/google-photos/route-helpers";
import { getValidGooglePhotosAccessToken } from "@/lib/server/google-photos/tokens";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/integrations/google-photos/picker/session/[id]/items
 * List the media items the user selected in a finished picker session.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();
    const { id } = await ctx.params;

    const accessToken = await getValidGooglePhotosAccessToken(user.id);
    const items = await listPickedItems(accessToken, id);

    return NextResponse.json({ sessionId: id, count: items.length, items });
  } catch (error) {
    return authErrorResponse(error) ?? serverError("google-photos/picker/items", error);
  }
}
