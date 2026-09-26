import { describe, expect, it } from "vitest";
import { describeResumatchEvent, resumatchActionTone, statusWord } from "./resumatch-audit";

describe("describeResumatchEvent", () => {
  it("reads a status change as from → to", () => {
    expect(
      describeResumatchEvent("application.status_changed", { fromStatus: "INTERVIEWING", toStatus: "OFFER" }),
    ).toBe("Interviewing → Offer");
  });

  it("describes a saved application with its starting status", () => {
    expect(describeResumatchEvent("application.created", { applicationId: "a", status: "APPLIED" })).toBe(
      "Saved an application (Applied)",
    );
  });

  it("copes with rows written before the richer metadata", () => {
    expect(describeResumatchEvent("application.created", { jobId: "a" })).toBe("Saved an application");
    expect(describeResumatchEvent("application.updated", { jobId: "a" })).toBe("Edited an application");
    expect(describeResumatchEvent("application.status_changed", null)).toBe("Changed an application's status");
  });

  it("names edited fields in plain words", () => {
    expect(describeResumatchEvent("application.updated", { changedFields: "notes,followUpDate" })).toBe(
      "Edited notes, follow-up date",
    );
  });

  it("describes generated CVs and letters with language and degraded state", () => {
    expect(describeResumatchEvent("tailoring.created", { outputLanguage: "nl", degraded: false })).toBe(
      "Tailored a CV (in NL)",
    );
    expect(describeResumatchEvent("cover_letter.created", { outputLanguage: "", degraded: true })).toBe(
      "Saved a cover letter (degraded)",
    );
  });

  it("returns null for actions with nothing more to say", () => {
    expect(describeResumatchEvent("workspace.created", undefined)).toBeNull();
  });
});

describe("resumatchActionTone", () => {
  it("colours status changes by outcome", () => {
    expect(resumatchActionTone("application.status_changed", { toStatus: "OFFER" })).toBe("success");
    expect(resumatchActionTone("application.status_changed", { toStatus: "REJECTED" })).toBe("danger");
    expect(resumatchActionTone("application.status_changed", { toStatus: "INTERVIEWING" })).toBe("info");
  });

  it("keeps the existing tones for other actions", () => {
    expect(resumatchActionTone("document.quarantined", {})).toBe("danger");
    expect(resumatchActionTone("document.deleted", {})).toBe("warning");
    expect(resumatchActionTone("workspace.created", {})).toBe("info");
  });
});

it("statusWord title-cases a status", () => {
  expect(statusWord("INTERVIEWING")).toBe("Interviewing");
});
