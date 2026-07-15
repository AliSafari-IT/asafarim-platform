import { NextResponse } from "next/server";

import { getAuthedUser, serverError, unauthorized } from "@/lib/server/auth";
import { createPickerSession } from "@/lib/server/google-photos/picker";
import { authErrorResponse } from "@/lib/server/google-photos/route-helpers";
import { getValidGooglePhotosAccessToken } from "@/lib/server/google-photos/tokens";

export const runtime = "nodejs";

/**
 * POST /api/integrations/google-photos/picker/session
 *
 * Creates a Photos Picker session and returns the `pickerUri` to open plus the
 * recommended poll interval.
 */
export async function POST() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const accessToken = await getValidGooglePhotosAccessToken(user.id);
    const session = await createPickerSession(accessToken);

    return NextResponse.json({
      sessionId: session.id,
      pickerUri: session.pickerUri,
      mediaItemsSet: session.mediaItemsSet,
      pollIntervalMs: session.pollIntervalMs,
      expireTime: session.expireTime,
    });
  } catch (error) {
    return authErrorResponse(error) ?? serverError("google-photos/picker/session", error);
  }
}
