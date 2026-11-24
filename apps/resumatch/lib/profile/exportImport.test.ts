import { describe, expect, it } from "vitest";
import { candidateProfileSchema } from "./contract";
import { MAX_IMPORT_VERSIONS, isNativeExport, readProfileExport } from "./exportImport";

/**
 * #942: a ResuMatch export restores its confirmed profile deterministically.
 * Every value here is synthetic.
 */

const enc = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));

/** A profile using every supported field, with order that must survive. */
const fullProfile = candidateProfileSchema.parse({
  fullName: "Jordan Example",
  email: "jordan@example.test",
  phone: "+32 400 00 00 00",
  headline: "Full-stack developer",
  summary: "Builds and tests web applications with a focus on reliable data.",
  baseLocation: "Genk, Belgium",
  workAuthorization: "eea_unrestricted",
  links: Array.from({ length: 8 }, (_, i) => ({ kind: i === 0 ? "linkedin" : "product", label: `Link ${i + 1}`, url: `https://example${i + 1}.test/` })),
  languages: [
    { code: "en", label: "English", proficiency: "professional" },
    { code: "nl", label: "Dutch", proficiency: "conversational" },
    { code: "fa", label: "Persian", proficiency: "native" },
  ],
  skills: Array.from({ length: 62 }, (_, i) => ({ name: `Skill ${i + 1}`, rawLabel: null, yearsExperience: null, category: i % 2 ? "Testing" : null })),
  experience: Array.from({ length: 5 }, (_, i) => ({
    title: `Role ${i + 1}`,
    employer: `Employer ${i + 1}`,
    startedOn: `20${10 + i}-0${(i % 9) + 1}`,
    endedOn: i === 0 ? null : `20${11 + i}-12`,
    isCurrent: i === 0,
    summary: `Did things at employer ${i + 1}.`,
  })),
  education: [
    { qualification: "MSc Hydrology", institution: "Example University", completedOn: "2004" },
    { qualification: "BSc Civil Engineering", institution: "Another University", completedOn: "2001-06" },
    { qualification: "Web development course", institution: "Example Academy", completedOn: null },
  ],
  preferences: { locations: ["Limburg"], remote: "hybrid", contractTypes: ["permanent"], salaryFloor: null, salaryCurrency: null },
});

function archive(overrides: Record<string, unknown> = {}, profileOverrides: Record<string, unknown> = {}) {
  // Twenty-one versions, newest last in the array; the confirmed one is
  // NOT the newest and NOT the first, so array order can never pick it.
  const versions = Array.from({ length: 21 }, (_, i) => ({
    id: `src-v${i + 1}`,
    versionNumber: i + 1,
    origin: "CORRECTED",
    extractorName: "test",
    extractorVersion: "1",
    createdAt: `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
    sourceContentHash: null,
    content: i === 13 ? fullProfile : candidateProfileSchema.parse({ headline: `Older headline ${i + 1}`, skills: [{ name: "Old skill" }] }),
    confidence: {},
  }));
  return {
    exportedAt: "2026-11-24T09:00:00.000Z",
    format: "resumatch-candidate-export",
    formatVersion: "1.0.0",
    workspace: { id: "source-workspace", createdAt: "2026-01-01T00:00:00.000Z" },
    documents: [{ id: "d1" }],
    profile: { confirmedVersionId: "src-v14", versions, ...profileOverrides },
    targetJobs: [{ id: "j1" }, { id: "j2" }],
    tailoredResumes: [{ id: "t1" }],
    profilePhoto: null,
    sentApplicationEmails: [{ id: "e1" }],
    evidence: [],
    contactPreferences: { content: {}, updatedAt: "2026-11-01T00:00:00.000Z" },
    emailDraftContacts: [],
    auditEvents: [{ action: "x", createdAt: "2026-11-01T00:00:00.000Z" }],
    notes: [],
    ...overrides,
  };
}

describe("isNativeExport", () => {
  it("recognises an export, even with leading whitespace", () => {
    expect(isNativeExport(enc(`\n  ${JSON.stringify(archive())}`))).toBe(true);
  });

  it("never calls a CV or other JSON an export", () => {
    expect(isNativeExport(enc("Jordan Example\nDeveloper at resumatch-candidate-export Ltd"))).toBe(false);
    expect(isNativeExport(enc({ format: "something-else", note: "resumatch-candidate-export" }))).toBe(false);
    expect(isNativeExport(enc('{"format":"resumatch-candidate-export"'))).toBe(false);
    expect(isNativeExport(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(false);
    expect(isNativeExport(new Uint8Array([0xff, 0xfe, 0x00]))).toBe(false);
  });
});

describe("readProfileExport", () => {
  it("restores the confirmed version by id, not by array order, with every field intact", () => {
    const result = readProfileExport(enc(archive()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toEqual(fullProfile);
    // Order is kept exactly.
    expect(result.content.experience.map((e) => e.employer)).toEqual(fullProfile.experience.map((e) => e.employer));
    expect(result.content.skills[1].category).toBe("Testing");
    expect(result.preview.source).toMatchObject({ id: "src-v14", versionNumber: 14, confirmed: true });
    expect(result.preview.usedConfirmedVersion).toBe(true);
    expect(result.preview.counts).toEqual({
      experience: { inExport: 5, imported: 5 },
      skills: { inExport: 62, imported: 62 },
      education: { inExport: 3, imported: 3 },
      certifications: { inExport: 0, imported: 0 },
      languages: { inExport: 3, imported: 3 },
      links: { inExport: 8, imported: 8 },
    });
    expect(result.preview.fields).toEqual({
      fullName: true,
      email: true,
      phone: true,
      headline: true,
      summary: true,
      baseLocation: true,
      workAuthorization: true,
      preferences: true,
    });
  });

  it("lists everything it leaves out and never carries source ids into the content", () => {
    const result = readProfileExport(enc(archive()));
    if (!result.ok) throw new Error(result.code);
    expect(result.preview.excluded).toEqual([
      { part: "otherVersions", count: 20 },
      { part: "documents", count: 1 },
      { part: "targetJobs", count: 2 },
      { part: "tailoredResumes", count: 1 },
      { part: "sentApplicationEmails", count: 1 },
      { part: "contactPreferences", count: 1 },
      { part: "auditEvents", count: 1 },
    ]);
    const serialised = JSON.stringify(result.content);
    expect(serialised).not.toContain("source-workspace");
    expect(serialised).not.toContain("src-v");
  });

  it("never picks a version silently when none is confirmed", () => {
    for (const confirmedVersionId of [null, "missing-id"]) {
      const result = readProfileExport(enc(archive({}, { confirmedVersionId })));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("NO_CONFIRMED_VERSION");
      expect(result.versions?.[0]).toMatchObject({ id: "src-v21", versionNumber: 21, confirmed: false });
      expect(result.versions).toHaveLength(21);
    }
  });

  it("imports an explicitly chosen version", () => {
    const result = readProfileExport(enc(archive({}, { confirmedVersionId: null })), "src-v3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.headline).toBe("Older headline 3");
    expect(result.preview.usedConfirmedVersion).toBe(false);
    expect(readProfileExport(enc(archive()), "nope")).toMatchObject({ ok: false, code: "VERSION_NOT_FOUND" });
  });

  it("rejects what it cannot read faithfully", () => {
    expect(readProfileExport(enc("{not json"))).toMatchObject({ ok: false, code: "INVALID_JSON" });
    expect(readProfileExport(enc({ format: "other" }))).toMatchObject({ ok: false, code: "NOT_NATIVE_EXPORT" });
    expect(readProfileExport(enc(archive({ formatVersion: "2.0.0" })))).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT_VERSION" });
    expect(readProfileExport(enc(archive({ formatVersion: 1 })))).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT_VERSION" });
    expect(readProfileExport(enc(archive({ profile: null })))).toMatchObject({ ok: false, code: "NO_PROFILE" });
    expect(readProfileExport(enc(archive({ profile: { confirmedVersionId: null, versions: [] } })))).toMatchObject({ ok: false, code: "NO_PROFILE" });
    expect(readProfileExport(enc(archive({ profile: { versions: "x" } })))).toMatchObject({ ok: false, code: "MALFORMED_EXPORT" });
    expect(readProfileExport(new Uint8Array([0xff, 0xfe]))).toMatchObject({ ok: false, code: "NOT_NATIVE_EXPORT" });
  });

  it("rejects a confirmed version whose content fails the contract, naming the field", () => {
    const bad = archive();
    (bad.profile.versions[13] as { content: unknown }).content = { ...fullProfile, experience: [{ title: "" }] };
    expect(readProfileExport(enc(bad))).toMatchObject({ ok: false, code: "INVALID_PROFILE_CONTENT", field: "experience.0.title" });

    const unknownKey = archive();
    (unknownKey.profile.versions[13] as { content: unknown }).content = { ...fullProfile, workspaceId: "source-workspace" };
    expect(readProfileExport(enc(unknownKey))).toMatchObject({ ok: false, code: "INVALID_PROFILE_CONTENT" });

    const protectedKey = archive();
    (protectedKey.profile.versions[13] as { content: unknown }).content = { ...fullProfile, dateOfBirth: "1980-01" };
    expect(readProfileExport(enc(protectedKey))).toMatchObject({ ok: false, code: "INVALID_PROFILE_CONTENT", field: "dateOfBirth" });
  });

  it("bounds the input", () => {
    const many = archive({}, {
      versions: Array.from({ length: MAX_IMPORT_VERSIONS + 1 }, (_, i) => ({ id: `v${i}`, versionNumber: i, content: {} })),
    });
    expect(readProfileExport(enc(many))).toMatchObject({ ok: false, code: "TOO_MANY_VERSIONS" });
    expect(readProfileExport(new Uint8Array(20 * 1024 * 1024 + 1))).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
  });
});
