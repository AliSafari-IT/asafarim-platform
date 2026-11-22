import { describe, expect, it } from "vitest";
import { parseProfileContent } from "../profile/contract";
import {
  containsContactDetails,
  findExperience,
  MAX_EVIDENCE_DETAIL_CHARS,
  MAX_EVIDENCE_TITLE_CHARS,
  parseEvidenceInput,
} from "./contract";

const valid = { kind: "ACHIEVEMENT", title: "Faster checkout", detail: "Cut checkout time by 30% in 2024." };

describe("parseEvidenceInput (#929)", () => {
  it("accepts and trims a valid item, with or without a role", () => {
    expect(parseEvidenceInput({ ...valid, title: "  Faster checkout  " })).toEqual({
      ok: true,
      value: { kind: "ACHIEVEMENT", title: "Faster checkout", detail: valid.detail, experienceRef: null },
    });
    expect(parseEvidenceInput({ ...valid, experienceRef: { title: "Backend developer", employer: "Acme", startedOn: "2021-03" } })).toMatchObject({
      ok: true,
      value: { experienceRef: { title: "Backend developer", employer: "Acme", startedOn: "2021-03" } },
    });
  });

  it.each([
    ["kind", { ...valid, kind: "SKILL" }],
    ["title_missing", { ...valid, title: "   " }],
    ["title_too_long", { ...valid, title: "t".repeat(MAX_EVIDENCE_TITLE_CHARS + 1) }],
    ["detail_missing", { ...valid, detail: "" }],
    ["detail_too_long", { ...valid, detail: "d".repeat(MAX_EVIDENCE_DETAIL_CHARS + 1) }],
    ["experience_ref", { ...valid, experienceRef: { employer: "Acme" } }],
    ["motivation_with_role", { ...valid, kind: "MOTIVATION", experienceRef: { title: "Backend developer" } }],
    ["contact_details", { ...valid, detail: "Reach me at sam@example.test" }],
  ])("refuses %s, never cuts it", (error, body) => {
    expect(parseEvidenceInput(body)).toEqual({ ok: false, error });
  });

  it("has no skill kind: new skills go through the profile", () => {
    expect(parseEvidenceInput({ ...valid, kind: "SKILL" })).toMatchObject({ ok: false });
  });
});

describe("containsContactDetails", () => {
  it.each(["sam@example.test", "+32 470 12 34 56", "0470 12 34 56", "call 0470-123456"])("finds %s", (text) => {
    expect(containsContactDetails(text)).toBe(true);
  });
  it.each(["2019-2021", "from 2019 to 2021", "1,200,000 users", "cut costs 30%", "version 0.6.1"])("leaves %s alone", (text) => {
    expect(containsContactDetails(text)).toBe(false);
  });
});

describe("findExperience", () => {
  const profile = parseProfileContent({
    experience: [{ title: "Backend developer", employer: "Acme", startedOn: "2021-03" }],
  });
  it("matches a role by title, employer and start, ignoring case", () => {
    expect(findExperience(profile, { title: "backend Developer", employer: "ACME", startedOn: "2021-03" })).not.toBeNull();
    expect(findExperience(profile, { title: "Backend developer", employer: "Acme", startedOn: null })).not.toBeNull();
  });
  it("finds nothing for a role the profile does not have", () => {
    expect(findExperience(profile, { title: "Backend developer", employer: "Other", startedOn: null })).toBeNull();
    expect(findExperience(profile, { title: "Backend developer", employer: "Acme", startedOn: "2020-01" })).toBeNull();
  });
});
