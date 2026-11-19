import { describe, expect, it } from "vitest";
import { APPLICATION_NOTES_MAX_LENGTH, parseApplicationPatch, parseFollowUpDate } from "./patch";

describe("parseApplicationPatch", () => {
  it("rejects non-object JSON, arrays and null", () => {
    for (const body of [null, 42, "notes", true, [], [{ notes: "x" }]]) {
      const result = parseApplicationPatch(body);
      expect(result.ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("rejects an empty object: a request must change something", () => {
    expect(parseApplicationPatch({})).toEqual({ ok: false, error: "No fields to update.", fields: [] });
  });

  it("rejects unknown keys instead of ignoring them", () => {
    const result = parseApplicationPatch({ notes: "x", workspaceId: "other" });
    expect(result).toMatchObject({ ok: false, fields: ["workspaceId"] });
  });

  it("rejects wrong types rather than coercing them to null", () => {
    for (const [field, value] of [
      ["notes", 42],
      ["notes", { text: "x" }],
      ["notes", ["x"]],
      ["status", "WON"],
      ["status", 1],
      ["followUpDate", 1_700_000_000_000],
      ["followUpDate", true],
      ["tailoredResumeId", 7],
      ["tailoredResumeId", ""],
    ] as const) {
      expect(parseApplicationPatch({ [field]: value }), `${field}=${JSON.stringify(value)}`).toMatchObject({
        ok: false,
        fields: [field],
      });
    }
  });

  it("rejects invalid dates", () => {
    for (const value of ["soon", "", "2026-02-30", "2026-13-01", "11/19/2026", "2026-11-19T10:00:00"]) {
      expect(parseApplicationPatch({ followUpDate: value }), value).toMatchObject({ ok: false, fields: ["followUpDate"] });
    }
  });

  it("allows null only on nullable fields", () => {
    expect(parseApplicationPatch({ status: null })).toMatchObject({ ok: false, fields: ["status"] });
    expect(parseApplicationPatch({ notes: null, followUpDate: null, tailoredResumeId: null })).toEqual({
      ok: true,
      patch: { notes: null, followUpDate: null, tailoredResumeId: null },
    });
  });

  it("keeps omitted fields omitted, so the service leaves them unchanged", () => {
    const result = parseApplicationPatch({ status: "APPLIED" });
    expect(result).toEqual({ ok: true, patch: { status: "APPLIED" } });
    if (result.ok) expect("notes" in result.patch).toBe(false);
  });

  it("parses valid dates", () => {
    expect(parseApplicationPatch({ followUpDate: "2026-12-01" })).toEqual({
      ok: true,
      patch: { followUpDate: new Date("2026-12-01T00:00:00Z") },
    });
    expect(parseApplicationPatch({ followUpDate: "2026-12-01T09:30:00+01:00" })).toEqual({
      ok: true,
      patch: { followUpDate: new Date("2026-12-01T08:30:00Z") },
    });
  });

  it("caps note length", () => {
    expect(parseApplicationPatch({ notes: "x".repeat(APPLICATION_NOTES_MAX_LENGTH) }).ok).toBe(true);
    expect(parseApplicationPatch({ notes: "x".repeat(APPLICATION_NOTES_MAX_LENGTH + 1) })).toMatchObject({
      ok: false,
      fields: ["notes"],
    });
  });

  it("never echoes a rejected value in the error", () => {
    const secret = "call recruiter about salary 95k";
    const result = parseApplicationPatch({ notes: secret, extra: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("parseFollowUpDate", () => {
  it("accepts leap days only in leap years", () => {
    expect(parseFollowUpDate("2028-02-29")).toEqual(new Date("2028-02-29T00:00:00Z"));
    expect(parseFollowUpDate("2027-02-29")).toBeNull();
  });
});
