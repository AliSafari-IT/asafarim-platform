import { describe, expect, it } from "vitest";
import { parseProfileContent } from "../profile/contract";
import {
  containsContactDetails,
  describeExperienceRef,
  findExperience,
  MAX_EVIDENCE_DETAIL_CHARS,
  MAX_EVIDENCE_TITLE_CHARS,
  parseEvidenceInput,
  sameExperience,
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

describe("contact details across fields", () => {
  it("doesn't join the title and detail into one phone number", () => {
    const parsed = parseEvidenceInput({ kind: "ACHIEVEMENT", title: "Tickets per day: 250-300", detail: "2024 average, up from 200 per day in 2023." });
    expect(parsed.ok).toBe(true);
  });
  it("still refuses a number inside one field", () => {
    expect(parseEvidenceInput({ ...valid, detail: "Call 415-555-2671." })).toEqual({ ok: false, error: "contact_details" });
  });
});

describe("containsContactDetails", () => {
  it.each(["sam@example.test", "+32 470 12 34 56", "0470 12 34 56", "call 0470-123456", "Contact me at 415-555-2671.", "(415) 555 2671", "415.555.2671"])("finds %s", (text) => {
    expect(containsContactDetails(text)).toBe(true);
  });
  it.each(["2019-2021", "from 2019 to 2021", "1,200,000 users", "cut costs 30%", "version 0.6.1", "120 engineers in 3 teams", "2019-2021: 1,200 users"])("leaves %s alone", (text) => {
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

describe("repeat roles", () => {
  const first = { title: "Developer", employer: "Acme", startedOn: "2018-01" };
  const second = { title: "Developer", employer: "Acme", startedOn: "2022-06" };

  it("names the start date, so two stints at one employer read apart in the prompt", () => {
    expect(describeExperienceRef(first)).toBe("Developer at Acme, from 2018-01");
    expect(describeExperienceRef(second)).not.toBe(describeExperienceRef(first));
    expect(describeExperienceRef({ title: "Developer", employer: null, startedOn: null })).toBe("Developer");
  });

  it("matches a role written with different case or spacing, but not another stint", () => {
    expect(sameExperience(first, { title: " developer ", employer: "ACME", startedOn: "2018-01" })).toBe(true);
    expect(sameExperience(first, second)).toBe(false);
    expect(sameExperience(first, { title: "Developer", employer: "Acme", startedOn: null })).toBe(true);
  });
});
