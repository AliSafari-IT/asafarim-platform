import { describe, expect, it } from "vitest";
import { applicationAuditEvents, type ApplicationAuditState } from "./audit";
import { redact } from "../observability/redact";

const ids = { applicationId: "app_1", targetJobId: "job_1" };
const before: ApplicationAuditState = {
  status: "APPLIED",
  notes: "Called the recruiter",
  followUpDate: new Date("2026-10-01T00:00:00Z"),
  tailoredResumeId: "tr_1",
};

describe("applicationAuditEvents", () => {
  it("records a status change with from and to", () => {
    expect(applicationAuditEvents(ids, before, { status: "INTERVIEWING" })).toEqual([
      {
        action: "application.status_changed",
        metadata: { applicationId: "app_1", targetJobId: "job_1", fromStatus: "APPLIED", toStatus: "INTERVIEWING" },
      },
    ]);
  });

  it("writes nothing when the PATCH changes nothing", () => {
    expect(
      applicationAuditEvents(ids, before, {
        status: "APPLIED",
        notes: "Called the recruiter",
        followUpDate: new Date("2026-10-01T00:00:00Z"),
        tailoredResumeId: "tr_1",
      }),
    ).toEqual([]);
    expect(applicationAuditEvents(ids, before, {})).toEqual([]);
  });

  it("names the other changed fields, never their values", () => {
    const events = applicationAuditEvents(ids, before, {
      notes: "Offer expected Friday",
      followUpDate: null,
      tailoredResumeId: "tr_2",
    });
    expect(events).toEqual([
      {
        action: "application.updated",
        metadata: { ...ids, changedFields: "notes,followUpDate,tailoredResumeId" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("Offer expected Friday");
  });

  it("records a status change and a notes edit as two events", () => {
    const events = applicationAuditEvents(ids, before, { status: "OFFER", notes: "Great news" });
    expect(events.map((e) => e.action)).toEqual(["application.status_changed", "application.updated"]);
  });

  it("treats null and empty-before notes consistently", () => {
    const noNotes = { ...before, notes: null };
    expect(applicationAuditEvents(ids, noNotes, { notes: null })).toEqual([]);
    expect(applicationAuditEvents(ids, noNotes, { notes: "x" })[0]?.metadata.changedFields).toBe("notes");
  });

  it("survives the audit redactor intact", () => {
    for (const event of applicationAuditEvents(ids, before, { status: "REJECTED", notes: "n" })) {
      expect(redact(event.metadata)).toEqual(event.metadata);
    }
  });
});

describe("redact: audit keys for tailoring and applications", () => {
  it("keeps tailoringId but still drops any key containing resume/cv", () => {
    expect(redact({ tailoringId: "tr_1", coverLetterId: "cl_1", degraded: false, outputLanguage: "nl" })).toEqual({
      tailoringId: "tr_1",
      coverLetterId: "cl_1",
      degraded: false,
      outputLanguage: "nl",
    });
    expect(redact({ tailoredResumeId: "tr_1", cvId: "x" })).toEqual({});
  });
});
