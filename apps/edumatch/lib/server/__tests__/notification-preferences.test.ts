import { describe, it, expect } from "vitest";
import {
  shouldDeliverWith,
  DEFAULT_PREFERENCES,
  type EduNotificationPreferences,
} from "../notification-preferences";

const baseUser = "user-123";

function prefs(overrides: Partial<EduNotificationPreferences> = {}): EduNotificationPreferences {
  return { userId: baseUser, ...DEFAULT_PREFERENCES, ...overrides };
}

describe("shouldDeliverWith", () => {
  it("default in-app delivery is on for all events", () => {
    const p = prefs();
    expect(shouldDeliverWith(p, "INQUIRY_RECEIVED", "inApp")).toBe(true);
    expect(shouldDeliverWith(p, "AI_RESPONSE_READY", "inApp")).toBe(true);
    expect(shouldDeliverWith(p, "QUOTE_RECEIVED", "inApp")).toBe(true);
    expect(shouldDeliverWith(p, "BOOKING_CONFIRMED", "inApp")).toBe(true);
    expect(shouldDeliverWith(p, "CANCELLATION_UPDATE", "inApp")).toBe(true);
    expect(shouldDeliverWith(p, "DISPUTE_UPDATE", "inApp")).toBe(true);
    expect(shouldDeliverWith(p, "PAYOUT_SENT", "inApp")).toBe(true);
  });

  it("default email delivery is conservative — AI response is opt-in", () => {
    const p = prefs();
    expect(shouldDeliverWith(p, "AI_RESPONSE_READY", "email")).toBe(false);
    // Other transactional channels default-on.
    expect(shouldDeliverWith(p, "BOOKING_CONFIRMED", "email")).toBe(true);
    expect(shouldDeliverWith(p, "PAYOUT_SENT", "email")).toBe(true);
  });

  it("respects opt-outs", () => {
    const p = prefs({
      inAppQuoteReceived: false,
      emailBookingConfirmed: false,
    });
    expect(shouldDeliverWith(p, "QUOTE_RECEIVED", "inApp")).toBe(false);
    expect(shouldDeliverWith(p, "BOOKING_CONFIRMED", "email")).toBe(false);
    // Non-overridden flags still default-on.
    expect(shouldDeliverWith(p, "QUOTE_RECEIVED", "email")).toBe(true);
    expect(shouldDeliverWith(p, "BOOKING_CONFIRMED", "inApp")).toBe(true);
  });

  it("dispute and cancellation channels are independent", () => {
    const p = prefs({ inAppDisputeUpdate: false });
    expect(shouldDeliverWith(p, "DISPUTE_UPDATE", "inApp")).toBe(false);
    expect(shouldDeliverWith(p, "CANCELLATION_UPDATE", "inApp")).toBe(true);
  });
});
