import { describe, expect, it } from "vitest";
import { OUTPUT_LANGUAGES } from "../tailoring/language";
import {
  describeDays,
  EMPTY_PREFERENCES,
  parseContactPreferences,
  readContactPreferences,
  renderContactParagraph,
  resolveContactPreferences,
  swapContactParagraph,
  timeZoneCity,
  type ContactPreferences,
} from "./contract";

const weekdays = { days: [1, 2, 3, 4, 5] as ContactPreferences["callWindows"][number]["days"], start: "16:00", end: "18:00" };
const ali: ContactPreferences = { ...EMPTY_PREFERENCES, callWindows: [weekdays], outsideHours: "arrange", email: true, whatsapp: true };

describe("renderContactParagraph (#940)", () => {
  it("writes the example from the issue, word for word", () => {
    expect(renderContactParagraph(ali, "en")).toBe(
      "The best time to reach me by phone is Monday to Friday between 16:00 and 18:00, Brussels time. Outside these hours, please arrange a call in advance. You're welcome to send me an email or WhatsApp message at any time, and I'll respond when available.",
    );
  });

  it("writes it in each output language", () => {
    expect(renderContactParagraph(ali, "nl")).toContain("maandag tot en met vrijdag tussen 16:00 en 18:00 (tijd in Brussel)");
    expect(renderContactParagraph(ali, "fr")).toContain("du lundi au vendredi entre 16h00 et 18h00 (heure de Bruxelles)");
    expect(renderContactParagraph(ali, "de")).toContain("Montag bis Freitag zwischen 16:00 und 18:00 Uhr (Zeitzone Brüssel)");
  });

  it("never promises an immediate reply, in any language", () => {
    const fast = /immediately|right away|straight away|at once|onmiddellijk|meteen|direct|immédiatement|tout de suite|sofort|umgehend|unverzüglich/i;
    for (const language of OUTPUT_LANGUAGES) {
      for (const prefs of [ali, { ...ali, whatsapp: false }, { ...ali, email: false }]) {
        const text = renderContactParagraph(prefs, language)!;
        expect(text).not.toMatch(fast);
      }
    }
    expect(renderContactParagraph(ali, "en")).toContain("I'll respond when available");
  });

  it("names email only, WhatsApp only, both, or neither", () => {
    const only = (email: boolean, whatsapp: boolean) => renderContactParagraph({ ...EMPTY_PREFERENCES, email, whatsapp }, "en");
    expect(only(true, false)).toBe("You're welcome to send me an email at any time, and I'll respond when available.");
    expect(only(false, true)).toBe("You're welcome to send me a WhatsApp message at any time, and I'll respond when available.");
    expect(only(true, true)).toContain("an email or WhatsApp message");
    expect(only(false, false)).toBeNull();
  });

  it("asks to arrange calls without call times, or lists unavailable times with the zone", () => {
    expect(renderContactParagraph({ ...EMPTY_PREFERENCES, outsideHours: "arrange" }, "en")).toBe("Please arrange phone calls with me in advance.");
    const unavailable = renderContactParagraph(
      { ...EMPTY_PREFERENCES, outsideHours: "unavailable", unavailable: [{ days: [3], start: "09:00", end: "12:00" }] },
      "en",
    );
    expect(unavailable).toBe("I'm not available for calls on Wednesday between 09:00 and 12:00, Brussels time.");
  });

  it("joins several windows so each stays readable", () => {
    const text = renderContactParagraph(
      { ...EMPTY_PREFERENCES, callWindows: [weekdays, { days: [6], start: "10:00", end: "12:00" }] },
      "en",
    );
    expect(text).toBe("The best time to reach me by phone is Monday to Friday between 16:00 and 18:00, and Saturday between 10:00 and 12:00, Brussels time.");
  });

  it("is null with nothing to say, so the email stays as it is today", () => {
    expect(renderContactParagraph(null, "en")).toBeNull();
    expect(renderContactParagraph(EMPTY_PREFERENCES, "en")).toBeNull();
  });
});

describe("describeDays", () => {
  it("collapses runs of three or more and lists the rest", () => {
    expect(describeDays([1, 2, 3, 4, 5], "en")).toBe("Monday to Friday");
    expect(describeDays([1, 3, 5], "en")).toBe("Monday, Wednesday, and Friday");
    expect(describeDays([6, 7], "en")).toBe("Saturday and Sunday");
    expect(describeDays([1, 2, 3, 5], "en")).toBe("Monday to Wednesday and Friday");
    expect(describeDays([1, 4], "fr")).toBe("le lundi et le jeudi");
  });
});

describe("timeZoneCity", () => {
  it("uses the city's name in the email's language, else the zone's own", () => {
    expect(timeZoneCity("Europe/Brussels", "fr")).toBe("Bruxelles");
    expect(timeZoneCity("America/New_York", "en")).toBe("New York");
  });
});

describe("parseContactPreferences", () => {
  it("accepts valid input and sorts the days", () => {
    const parsed = parseContactPreferences({ ...ali, callWindows: [{ days: [5, 1], start: "09:00", end: "10:00" }] });
    expect(parsed).toMatchObject({ ok: true, value: { callWindows: [{ days: [1, 5] }] } });
  });

  it.each([
    [{ callWindows: [{ days: [], start: "09:00", end: "10:00" }] }, "days_missing"],
    [{ callWindows: [{ days: [1, 1], start: "09:00", end: "10:00" }] }, "days_repeated"],
    [{ callWindows: [{ days: [1], start: "9am", end: "10:00" }] }, "time_invalid"],
    [{ callWindows: [{ days: [1], start: "18:00", end: "16:00" }] }, "time_order"],
    [{ timeZone: "Mars/Olympus" }, "time_zone"],
    [{ outsideHours: "unavailable", unavailable: [] }, "unavailable_missing"],
    [{ callWindows: Array.from({ length: 6 }, () => weekdays) }, "too_many"],
  ])("refuses %j as %s, never fixing it", (patch, error) => {
    expect(parseContactPreferences({ ...ali, ...patch })).toEqual({ ok: false, error });
  });

  it("drops unavailable times unless they're chosen, and reads bad stored JSON as none", () => {
    const parsed = parseContactPreferences({ ...ali, outsideHours: "arrange", unavailable: [weekdays] });
    expect(parsed.ok && parsed.value.unavailable).toEqual([]);
    expect(readContactPreferences({ nonsense: true })).toBeNull();
  });
});

describe("resolveContactPreferences", () => {
  it("uses the defaults, the email's own values, or none", () => {
    const override = { ...EMPTY_PREFERENCES, email: true };
    expect(resolveContactPreferences("DEFAULT", ali, override)).toBe(ali);
    expect(resolveContactPreferences("OVERRIDE", ali, override)).toBe(override);
    expect(resolveContactPreferences("OMIT", ali, override)).toBeNull();
  });
});

describe("swapContactParagraph", () => {
  const body = "Dear team,\n\nI am applying.\n\nOLD\n\nKind regards,\nJordan";
  it("replaces, removes, or inserts the paragraph before the sign-off", () => {
    expect(swapContactParagraph(body, "OLD", "NEW")).toBe("Dear team,\n\nI am applying.\n\nNEW\n\nKind regards,\nJordan");
    expect(swapContactParagraph(body, "OLD", null)).toBe("Dear team,\n\nI am applying.\n\nKind regards,\nJordan");
    expect(swapContactParagraph("Dear team,\n\nI am applying.\n\nKind regards,\nJordan", null, "NEW")).toBe(body.replace("OLD", "NEW"));
  });
  it("refuses when the body no longer holds the old paragraph", () => {
    expect(swapContactParagraph("Dear team,\n\nKind regards,\nJordan", "OLD", "NEW")).toBeNull();
  });
});
