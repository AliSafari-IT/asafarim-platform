import { NextResponse } from "next/server";

import { getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import {
  deletePickerSession,
  getPickerSession,
} from "@/lib/server/google-photos/picker";
import { authErrorResponse } from "@/lib/server/google-photos/route-helpers";
import { getValidGooglePhotosAccessToken } from "@/lib/server/google-photos/tokens";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/integrations/google-photos/picker/session/[id]
 * Poll whether the user has finished selecting in the picker.
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();
    const { id } = await ctx.params;

    const accessToken = await getValidGooglePhotosAccessToken(user.id);
    const session = await getPickerSession(accessToken, id);

    return NextResponse.json({
      sessionId: session.id,
      mediaItemsSet: session.mediaItemsSet,
      pollIntervalMs: session.pollIntervalMs,
      expireTime: session.expireTime,
    });
  } catch (error) {
    return authErrorResponse(error) ?? serverError("google-photos/picker/session/get", error);
  }
}

/**
 * DELETE /api/integrations/google-photos/picker/session/[id]
 * Tear down a picker session once import is done.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();
    const { id } = await ctx.params;

    const accessToken = await getValidGooglePhotosAccessToken(user.id);
    await deletePickerSession(accessToken, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return authErrorResponse(error) ?? serverError("google-photos/picker/session/delete", error);
  }
}
