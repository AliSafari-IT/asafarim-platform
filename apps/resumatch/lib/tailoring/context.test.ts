import { describe, expect, it } from "vitest";
import {
  contextForSavedCv,
  fingerprintJobText,
  parseStoredTailoringContext,
  resolveTailoringContext,
  staleContextReason,
  tailoringContextFingerprint,
  TAILORING_CONTEXT_VERSION,
  type ResolveTailoringContextInput,
} from "./context";
import { MAX_INSTRUCTIONS_CHARS, MAX_JOB_CHARS } from "./ai/prompts";

const base: ResolveTailoringContextInput = {
  workspaceId: "ws_1",
  profileVersionId: "pv_1",
  targetJobId: "job_1",
  jobRawText: "Backend engineer. Node.js, PostgreSQL.",
  instructions: "  Lead with my backend work; leave out the bakery job.  ",
  lowFit: false,
  cvLanguage: "en",
  coverLetter: { tone: "warm", length: "short" },
};

describe("resolveTailoringContext", () => {
  it("resolves one versioned context for the CV and the letter", () => {
    const context = resolveTailoringContext(base);
    expect(context).toMatchObject({
      version: TAILORING_CONTEXT_VERSION,
      workspaceId: "ws_1",
      profileVersionId: "pv_1",
      targetJobId: "job_1",
      jobTextFingerprint: fingerprintJobText(base.jobRawText),
      jobTextUsed: base.jobRawText,
      instructions: "Lead with my backend work; leave out the bakery job.",
      lowFit: false,
      cv: { outputLanguage: "en" },
      // #642: the letter follows the CV's language when none is chosen.
      coverLetter: { outputLanguage: "en", tone: "warm", length: "short" },
      preferenceRevisionId: null,
      evidenceRevisionIds: [],
    });
  });

  it("keeps the letter's own language, and the letter defaults when tone/length are omitted", () => {
    const context = resolveTailoringContext({ ...base, coverLetter: { outputLanguage: "nl" } });
    expect(context.coverLetter).toEqual({ outputLanguage: "nl", tone: "formal", length: "standard" });
  });

  it("has no letter block when no letter was asked for, and no note when it is blank", () => {
    const context = resolveTailoringContext({ ...base, coverLetter: null, instructions: "   " });
    expect(context.coverLetter).toBeNull();
    expect(context.instructions).toBeNull();
  });

  it("caps the note and the job-text copy", () => {
    const context = resolveTailoringContext({
      ...base,
      instructions: "x".repeat(MAX_INSTRUCTIONS_CHARS + 50),
      jobRawText: "j".repeat(MAX_JOB_CHARS * 2),
    });
    expect(context.instructions).toHaveLength(MAX_INSTRUCTIONS_CHARS);
    expect(context.jobTextUsed!.length).toBeLessThan(MAX_JOB_CHARS + 100);
    // The fingerprint stands for the full text, not the capped copy.
    expect(context.jobTextFingerprint).toBe(fingerprintJobText("j".repeat(MAX_JOB_CHARS * 2)));
  });
});

it("never stores half an emoji in the job-text copy", () => {
  const context = resolveTailoringContext({ ...base, jobRawText: `${"j".repeat(MAX_JOB_CHARS - 1)}\u{1F680} more` });
  expect(context.jobTextUsed!.startsWith(`${"j".repeat(MAX_JOB_CHARS - 1)}\n`)).toBe(true);
  expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(context.jobTextUsed!)).toBe(false);
});

describe("tailoringContextFingerprint", () => {
  const fingerprint = tailoringContextFingerprint(resolveTailoringContext(base));

  it("is stable for the same request", () => {
    expect(tailoringContextFingerprint(resolveTailoringContext(base))).toBe(fingerprint);
  });

  it.each<[string, Partial<ResolveTailoringContextInput>]>([
    ["workspace", { workspaceId: "ws_2" }],
    ["profile version", { profileVersionId: "pv_2" }],
    ["job", { targetJobId: "job_2" }],
    ["job text", { jobRawText: `${base.jobRawText} Kubernetes.` }],
    ["note", { instructions: "Lead with my frontend work." }],
    ["low fit", { lowFit: true }],
    ["CV language", { cvLanguage: "fr" }],
    ["letter tone", { coverLetter: { tone: "formal", length: "short" } }],
    ["letter length", { coverLetter: { tone: "warm", length: "detailed" } }],
    ["letter language", { coverLetter: { tone: "warm", length: "short", outputLanguage: "de" } }],
    ["no letter", { coverLetter: null }],
  ])("changes with the %s", (_label, change) => {
    expect(tailoringContextFingerprint(resolveTailoringContext({ ...base, ...change }))).not.toBe(fingerprint);
  });

  it("changes with a preference or evidence revision", () => {
    const context = resolveTailoringContext(base);
    expect(tailoringContextFingerprint({ ...context, preferenceRevisionId: "pref_1" })).not.toBe(fingerprint);
    expect(tailoringContextFingerprint({ ...context, evidenceRevisionIds: ["ev_1"] })).not.toBe(fingerprint);
  });

  it("ignores the job-text copy, which its fingerprint already covers", () => {
    expect(tailoringContextFingerprint(contextForSavedCv(resolveTailoringContext(base)))).toBe(fingerprint);
  });
});

describe("parseStoredTailoringContext", () => {
  it("round-trips a stored context", () => {
    const context = resolveTailoringContext(base);
    expect(parseStoredTailoringContext(JSON.parse(JSON.stringify(context)))).toEqual(context);
  });

  it("reads a legacy row (no snapshot) or junk as null", () => {
    expect(parseStoredTailoringContext(null)).toBeNull();
    expect(parseStoredTailoringContext(undefined)).toBeNull();
    expect(parseStoredTailoringContext("tailoring_context@1")).toBeNull();
    expect(parseStoredTailoringContext([])).toBeNull();
    expect(parseStoredTailoringContext({ version: "other@1", workspaceId: "ws_1" })).toBeNull();
  });

  it("gives missing optional fields the defaults the flow always had", () => {
    const parsed = parseStoredTailoringContext({
      version: TAILORING_CONTEXT_VERSION,
      workspaceId: "ws_1",
      profileVersionId: "pv_1",
      targetJobId: "job_1",
      jobTextFingerprint: "abc",
      coverLetter: { tone: "shouty", length: 3, outputLanguage: "xx" },
    });
    expect(parsed).toEqual({
      version: TAILORING_CONTEXT_VERSION,
      workspaceId: "ws_1",
      profileVersionId: "pv_1",
      targetJobId: "job_1",
      jobTextFingerprint: "abc",
      jobTextUsed: null,
      instructions: null,
      lowFit: false,
      cv: { outputLanguage: null },
      coverLetter: { outputLanguage: null, tone: "formal", length: "standard" },
      preferenceRevisionId: null,
      evidenceRevisionIds: [],
    });
  });
});

describe("staleContextReason", () => {
  const context = resolveTailoringContext(base);
  const current = {
    workspaceId: "ws_1",
    profileVersionId: "pv_1",
    targetJobId: "job_1",
    jobRawText: base.jobRawText,
    profileVersionConfirmed: true,
  };

  it("accepts the same request, including the note echoed back as sent", () => {
    expect(staleContextReason(context, current)).toBeNull();
    expect(staleContextReason(context, { ...current, instructions: base.instructions })).toBeNull();
  });

  it("refuses another workspace, profile version or job", () => {
    expect(staleContextReason(context, { ...current, workspaceId: "ws_2" })).toBe("workspace");
    expect(staleContextReason(context, { ...current, profileVersionId: "pv_2" })).toBe("profile_version");
    expect(staleContextReason(context, { ...current, targetJobId: "job_2" })).toBe("job");
  });

  it("refuses when the candidate confirmed a newer profile version since", () => {
    expect(staleContextReason(context, { ...current, profileVersionConfirmed: false })).toBe("profile_version");
  });

  it("refuses when the job text changed or is gone", () => {
    expect(staleContextReason(context, { ...current, jobRawText: `${base.jobRawText} Updated.` })).toBe("job_text");
    expect(staleContextReason(context, { ...current, jobRawText: null })).toBe("job_text");
  });

  it("refuses a different note", () => {
    expect(staleContextReason(context, { ...current, instructions: "Lead with frontend." })).toBe("instructions");
    expect(staleContextReason(context, { ...current, instructions: "" })).toBe("instructions");
  });
});
