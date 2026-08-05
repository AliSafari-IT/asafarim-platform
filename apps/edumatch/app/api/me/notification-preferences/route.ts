import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/server/auth";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import {
  getPreferences,
  upsertPreferences,
  type PreferencePatch,
} from "@/lib/server/notification-preferences";

export const runtime = "nodejs";

const ALLOWED_KEYS: (keyof PreferencePatch)[] = [
  "inAppInquiryReceived",
  "inAppAiResponseReady",
  "inAppQuoteReceived",
  "inAppBookingConfirmed",
  "inAppCancellationUpdate",
  "inAppDisputeUpdate",
  "inAppPayoutSent",
  "emailInquiryReceived",
  "emailAiResponseReady",
  "emailQuoteReceived",
  "emailBookingConfirmed",
  "emailCancellationUpdate",
  "emailDisputeUpdate",
  "emailPayoutSent",
];

/**
 * GET /api/me/notification-preferences
 *
 * Returns the caller's preferences (or defaults if no row exists).
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const prefs = await getPreferences(user.id);
    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("me/notification-preferences", error);
    }
    return serverError("me/notification-preferences", error);
  }
}

/**
 * PATCH /api/me/notification-preferences
 *
 * Body: { inAppQuoteReceived?: boolean, emailQuoteReceived?: boolean, ... }
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as PreferencePatch | null;
    if (!body || typeof body !== "object") return badRequest("Invalid body");

    const patch: PreferencePatch = {};
    for (const k of ALLOWED_KEYS) {
      const v = body[k];
      if (typeof v === "boolean") patch[k] = v;
    }

    const saved = await upsertPreferences(user.id, patch);
    return NextResponse.json({ preferences: saved });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("me/notification-preferences", error);
    }
    return serverError("me/notification-preferences", error);
  }
}
