/**
 * Phase 4 — Notification preferences for EduMatch.
 *
 * Per-user toggles for in-app and email delivery, keyed by domain event.
 * Absent rows mean "use defaults" (everything in-app on, email opt-in for
 * transactional and opt-out for marketing-adjacent).
 *
 * The dispatcher in `notifications.ts` calls `shouldDeliver` before sending.
 * If the user explicitly opted out, the notification is skipped (and the
 * decision is logged to the audit trail when it would be material — e.g. an
 * inquiry receipt).
 */

import { prisma } from "@asafarim/db";

export type NotificationEvent =
  | "INQUIRY_RECEIVED"
  | "AI_RESPONSE_READY"
  | "QUOTE_RECEIVED"
  | "BOOKING_CONFIRMED"
  | "CANCELLATION_UPDATE"
  | "DISPUTE_UPDATE"
  | "PAYOUT_SENT";

export type Channel = "inApp" | "email";

export type EduNotificationPreferences = {
  userId: string;
  inAppInquiryReceived: boolean;
  inAppAiResponseReady: boolean;
  inAppQuoteReceived: boolean;
  inAppBookingConfirmed: boolean;
  inAppCancellationUpdate: boolean;
  inAppDisputeUpdate: boolean;
  inAppPayoutSent: boolean;
  emailInquiryReceived: boolean;
  emailAiResponseReady: boolean;
  emailQuoteReceived: boolean;
  emailBookingConfirmed: boolean;
  emailCancellationUpdate: boolean;
  emailDisputeUpdate: boolean;
  emailPayoutSent: boolean;
};

/**
 * Default preferences. Mirrors the Prisma defaults so consumers can rely on
 * them without round-tripping the DB.
 */
export const DEFAULT_PREFERENCES: Omit<
  EduNotificationPreferences,
  "userId"
> = {
  inAppInquiryReceived: true,
  inAppAiResponseReady: true,
  inAppQuoteReceived: true,
  inAppBookingConfirmed: true,
  inAppCancellationUpdate: true,
  inAppDisputeUpdate: true,
  inAppPayoutSent: true,
  emailInquiryReceived: true,
  emailAiResponseReady: false,
  emailQuoteReceived: true,
  emailBookingConfirmed: true,
  emailCancellationUpdate: true,
  emailDisputeUpdate: true,
  emailPayoutSent: true,
};

const FIELD_BY_EVENT: Record<
  NotificationEvent,
  { inApp: keyof EduNotificationPreferences; email: keyof EduNotificationPreferences }
> = {
  INQUIRY_RECEIVED:    { inApp: "inAppInquiryReceived",    email: "emailInquiryReceived" },
  AI_RESPONSE_READY:   { inApp: "inAppAiResponseReady",    email: "emailAiResponseReady" },
  QUOTE_RECEIVED:      { inApp: "inAppQuoteReceived",      email: "emailQuoteReceived" },
  BOOKING_CONFIRMED:   { inApp: "inAppBookingConfirmed",   email: "emailBookingConfirmed" },
  CANCELLATION_UPDATE: { inApp: "inAppCancellationUpdate", email: "emailCancellationUpdate" },
  DISPUTE_UPDATE:      { inApp: "inAppDisputeUpdate",      email: "emailDisputeUpdate" },
  PAYOUT_SENT:         { inApp: "inAppPayoutSent",         email: "emailPayoutSent" },
};

/**
 * Resolve preferences for a user. Returns the persisted row if it exists,
 * else the defaults (without persisting). Callers wanting the row to be
 * persisted should use `upsertPreferences`.
 */
export async function getPreferences(
  userId: string,
): Promise<EduNotificationPreferences> {
  const row = await prisma.eduNotificationPreference.findUnique({
    where: { userId },
  });
  if (!row) return { userId, ...DEFAULT_PREFERENCES };
  return row as EduNotificationPreferences;
}

/**
 * Pure decision: given prefs and an event/channel, should we deliver?
 * Exposed so callers can pass a pre-fetched prefs row.
 */
export function shouldDeliverWith(
  prefs: EduNotificationPreferences,
  event: NotificationEvent,
  channel: Channel,
): boolean {
  const fields = FIELD_BY_EVENT[event];
  if (!fields) return true; // unknown events default to delivered
  const key = channel === "inApp" ? fields.inApp : fields.email;
  return prefs[key] as boolean;
}

/**
 * Convenience: fetch + decide in one call.
 */
export async function shouldDeliver(
  userId: string,
  event: NotificationEvent,
  channel: Channel,
): Promise<boolean> {
  const prefs = await getPreferences(userId);
  return shouldDeliverWith(prefs, event, channel);
}

export type PreferencePatch = Partial<Omit<EduNotificationPreferences, "userId">>;

/**
 * Upsert a user's preferences. Missing fields fall back to current values
 * (or defaults if no row exists yet).
 */
export async function upsertPreferences(
  userId: string,
  patch: PreferencePatch,
): Promise<EduNotificationPreferences> {
  const existing = await prisma.eduNotificationPreference.findUnique({
    where: { userId },
  });
  const base: Omit<EduNotificationPreferences, "userId"> = existing
    ? (existing as EduNotificationPreferences)
    : { userId, ...DEFAULT_PREFERENCES };
  const merged = { ...base, ...patch } as Omit<
    EduNotificationPreferences,
    "userId"
  >;
  const saved = await prisma.eduNotificationPreference.upsert({
    where: { userId },
    create: { userId, ...merged },
    update: merged,
  });
  return saved as EduNotificationPreferences;
}
