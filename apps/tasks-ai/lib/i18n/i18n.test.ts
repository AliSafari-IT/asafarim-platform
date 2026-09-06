import { describe, expect, it } from "vitest";
import { appDictionaries, en } from "./messages";
import { formatDate, formatNumber, weekDates, weekStartsOn } from "./format";

describe("app dictionaries", () => {
  it("nl and fr define every key that en defines (no untranslated string ships)", () => {
    const keys = Object.keys(en);
    for (const locale of ["nl", "fr"] as const) {
      const dict = appDictionaries[locale];
      const missing = keys.filter((k) => !(k in dict));
      expect(missing, `${locale} missing: ${missing.join(", ")}`).toHaveLength(0);
    }
  });

  it("has no empty translations", () => {
    for (const [loc, dict] of Object.entries(appDictionaries)) {
      for (const [k, v] of Object.entries(dict as Record<string, string>)) {
        expect(v.trim().length, `${loc}.${k} is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("locale formatting", () => {
  it("formats dates per locale", () => {
    const d = "2026-09-06T12:00:00Z";
    expect(formatDate(d, "en")).toMatch(/Sep/);
    expect(formatDate(d, "fr-BE")).toMatch(/sept/i);
    expect(formatDate(d, "nl-NL")).toMatch(/sep/i);
  });

  it("formats numbers per locale", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234.5, "nl-NL")).toBe("1.234,5");
    expect(formatNumber(1234.5, "fr-BE")).toMatch(/1\s?234,5/);
  });

  it("week starts Sunday for en, Monday for nl/fr/de", () => {
    expect(weekStartsOn("en")).toBe(0);
    expect(weekStartsOn("nl-BE")).toBe(1);
    expect(weekStartsOn("fr-LU")).toBe(1);
  });

  it("weekDates returns 7 days beginning on the locale's first weekday", () => {
    const days = weekDates(new Date("2026-09-09T00:00:00Z"), "nl-NL"); // a Wednesday
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1); // Monday
  });
});
