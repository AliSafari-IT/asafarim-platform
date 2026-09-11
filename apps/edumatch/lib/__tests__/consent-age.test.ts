import { describe, expect, it } from "vitest";
import {
  DEFAULT_MINOR_CONSENT_AGE,
  isBelowConsentAge,
  minorConsentAge,
} from "../consent-age";

function agedYears(years: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

describe("minorConsentAge", () => {
  it("returns 13 for Belgium", () => {
    expect(minorConsentAge("BE")).toBe(13);
  });

  it("returns 15 for France", () => {
    expect(minorConsentAge("FR")).toBe(15);
  });

  it("returns 16 for the Netherlands, Luxembourg, and Germany", () => {
    expect(minorConsentAge("NL")).toBe(16);
    expect(minorConsentAge("LU")).toBe(16);
    expect(minorConsentAge("DE")).toBe(16);
  });

  it("is case-insensitive", () => {
    expect(minorConsentAge("be")).toBe(13);
  });

  it("falls back to the GDPR default for an unmapped country", () => {
    expect(minorConsentAge("US")).toBe(DEFAULT_MINOR_CONSENT_AGE);
  });

  it("falls back to the GDPR default when no country is given", () => {
    expect(minorConsentAge(null)).toBe(DEFAULT_MINOR_CONSENT_AGE);
    expect(minorConsentAge(undefined)).toBe(DEFAULT_MINOR_CONSENT_AGE);
  });
});

describe("isBelowConsentAge", () => {
  it("is false for a 13-year-old in Belgium", () => {
    expect(isBelowConsentAge(agedYears(13), "BE")).toBe(false);
  });

  it("is true for a 13-year-old in the Netherlands", () => {
    expect(isBelowConsentAge(agedYears(13), "NL")).toBe(true);
  });

  it("is false for a 15-year-old in France, true for a 14-year-old", () => {
    expect(isBelowConsentAge(agedYears(15), "FR")).toBe(false);
    expect(isBelowConsentAge(agedYears(14), "FR")).toBe(true);
  });

  it("uses the GDPR default of 16 for an unlisted country", () => {
    expect(isBelowConsentAge(agedYears(16), "US")).toBe(false);
    expect(isBelowConsentAge(agedYears(15), "US")).toBe(true);
  });

  it("treats a missing date of birth as below the consent age", () => {
    expect(isBelowConsentAge(null, "BE")).toBe(true);
    expect(isBelowConsentAge(undefined, "BE")).toBe(true);
  });

  it("treats an unparseable date of birth as below the consent age", () => {
    expect(isBelowConsentAge("not-a-date", "BE")).toBe(true);
  });

  it("accepts an ISO date string, not just a Date object", () => {
    const iso = agedYears(14).toISOString().slice(0, 10);
    expect(isBelowConsentAge(iso, "BE")).toBe(false);
  });
});
